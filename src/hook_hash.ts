import { canonicalJsonBytes } from "./canonical";
import { canonicalizeHookWithPlatform } from "./hook_platform";
import {
  AcifBodyHashError,
  BODY_HASH_ALGORITHM,
  hashFile,
  sha256Hex,
} from "./body_hash";
import type { BodyHash, InMemoryBody } from "./body_hash";

const UTF8 = new TextEncoder();

/**
 * Raw UTF-8 byte order string comparison.
 */
function compareUtf8(left: string, right: string): number {
  const leftBytes = UTF8.encode(left);
  const rightBytes = UTF8.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return leftBytes.length - rightBytes.length;
}

/**
 * Concatenates multiple Uint8Arrays.
 */
function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Helper to normalize and sort the auxiliary_files block inside the canonical hook.
 * Duplicate paths are collapsed (first wins), and the list is sorted by raw UTF-8 byte order of path as written.
 */
function normalizeAuxiliaryFiles(canonicalHook: any): any {
  if (!("auxiliary_files" in canonicalHook) || !Array.isArray(canonicalHook.auxiliary_files)) {
    return canonicalHook;
  }

  const byPath = new Map<string, any>();
  for (const entry of canonicalHook.auxiliary_files) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const path = entry.path;
    if (typeof path !== "string") {
      continue;
    }
    // Do not NFC-normalize the path values placed into W; keep them exactly as written in canonical form.
    if (!byPath.has(path)) {
      byPath.set(path, {
        ...entry,
      });
    }
  }

  const sortedAux = Array.from(byPath.values()).sort((left, right) =>
    compareUtf8(left.path, right.path)
  );

  return {
    ...canonicalHook,
    auxiliary_files: sortedAux,
  };
}

/**
 * Extracts and NFC-normalizes referenced file paths from a canonical hook block.
 * The referenced-file set is: every `type: file` script entry's `path` across all handlers,
 * plus every `auxiliary_files` entry's `path`.
 */
function getReferencedFilePaths(canonicalHook: any): string[] {
  const paths = new Set<string>();

  const handlers = canonicalHook.handlers || [];
  for (const handler of handlers) {
    if (handler.type === "command" && Array.isArray(handler.scripts)) {
      for (const script of handler.scripts) {
        if (script.type === "file" && typeof script.path === "string") {
          paths.add(script.path.normalize("NFC"));
        }
      }
    }
  }

  if (Array.isArray(canonicalHook.auxiliary_files)) {
    for (const file of canonicalHook.auxiliary_files) {
      if (typeof file.path === "string") {
        paths.add(file.path.normalize("NFC"));
      }
    }
  }

  return Array.from(paths);
}

/**
 * Normalizes files Map/Object/Array from InMemoryBody.
 */
interface NormalizedBodyFile {
  readonly sourcePath: string;
  readonly normalizedPath: string;
  readonly content: string | Uint8Array;
}

function collectFiles(files: any): NormalizedBodyFile[] {
  const entries: { path: string; content: string | Uint8Array }[] = [];

  if (files instanceof Map) {
    for (const [path, content] of files.entries()) {
      entries.push({ path, content });
    }
  } else if (Array.isArray(files)) {
    entries.push(...files);
  } else if (files !== null && typeof files === "object") {
    for (const [path, content] of Object.entries(files)) {
      entries.push({ path, content: content as any });
    }
  }

  return entries.map(({ path, content }) => ({
    sourcePath: path,
    normalizedPath: path.normalize("NFC"),
    content,
  }));
}

/**
 * Computes the hook body_hash per [ACIF-HOOK] §9.
 */
export function computeHookBodyHash(
  hook: unknown,
  body: InMemoryBody = { files: {} }
): BodyHash {
  // 1. Inputs: Post-canonicalization form (§9.1)
  // Wire to the chunk 10/11 pipeline so hashing can never see pre-mapping bytes.
  const canonicalResult = canonicalizeHookWithPlatform(hook);
  const canonicalHook = canonicalResult.hook;

  // 2. Referenced-file manifest (§9.2)
  // Extract and normalize referenced paths
  const referencedPaths = getReferencedFilePaths(canonicalHook);

  // Parse files and symlinks
  const filesList = collectFiles(body.files);
  const normalizedFiles = new Map(filesList.map((file) => [file.normalizedPath, file]));

  // Symbolic links rejection
  const symlinksList = body.symlinks || [];
  if (symlinksList.length > 0) {
    throw new AcifBodyHashError("acif.body.symlink", undefined, { path: symlinksList[0] });
  }

  // Build manifest entries and enforce existence requirement
  const manifestEntries = referencedPaths.map((path) => {
    const file = normalizedFiles.get(path);
    if (file === undefined) {
      throw new AcifBodyHashError("acif.hook.script_file_missing", undefined, { path });
    }
    return {
      path,
      hash: hashFile(path, file.content),
    };
  });

  // Sort manifest entries by raw UTF-8 byte order of path
  manifestEntries.sort((left, right) => compareUtf8(left.path, right.path));

  // Construct manifest text and hash DH
  const manifestText = manifestEntries.map((entry) => `${entry.hash}  ${entry.path}\n`).join("");
  const manifestBytes = UTF8.encode(manifestText);
  const directoryHash = `sha256:${sha256Hex(manifestBytes)}`;

  // 3. Wiring serialization (§9.3)
  // Ensure W's auxiliary_files are sorted and duplicate-free
  const serializedHook = normalizeAuxiliaryFiles(canonicalHook);
  const wBytes = canonicalJsonBytes(serializedHook);

  // 4. Preimage and value (§9.4)
  const preimage = concatBytes(
    UTF8.encode(`${directoryHash}\n`),
    wBytes,
    UTF8.encode("\n")
  );

  return {
    algorithm: BODY_HASH_ALGORITHM,
    value: sha256Hex(preimage),
  };
}
