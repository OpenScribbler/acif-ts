import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  AcifBodyHashError,
  buildDirectoryManifest,
  computeFrontmatterBodyHash,
  type BodyFileEntry,
} from "./body_hash";
import { validateEnvelope } from "./envelope";
import { computeMetadataHash } from "./metadata_hash";
import {
  ACIF_REQUIRES_CONTENT_TYPES,
  validateRequiresSlotForContentType,
  type AcifRequiresContentType,
} from "./requires";

interface CliRejection {
  readonly id: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

interface ParsedOptions {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}

interface IngestedBody {
  readonly files: readonly BodyFileEntry[];
  readonly symlinks: readonly string[];
}

type JsonRecord = Record<string, unknown>;

const REQUIRES_CONTENT_TYPES = new Set<string>(ACIF_REQUIRES_CONTENT_TYPES);

export async function runCli(argv: string[]): Promise<number> {
  try {
    return await runCommand(argv);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      writeStdoutJson({
        ok: false,
        rejections: [toCliRejection(error)],
      });
      return 1;
    }

    if (error instanceof CliError) {
      writeStderr(error.message);
      return 2;
    }

    writeStderr(formatUnexpectedError(error));
    return 2;
  }
}

async function runCommand(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "validate":
      return validateCommand(rest);
    case "hash":
      return hashCommand(rest);
    case "ingest":
      return ingestCommand(rest);
    default:
      throw usageError(`Unknown command: ${command ?? "(none)"}`);
  }
}

async function validateCommand(argv: readonly string[]): Promise<number> {
  if (argv.length !== 1) {
    throw usageError("validate expects exactly one input");
  }

  const record = await readJsonInput(argv[0]);
  const envelopeResult = validateEnvelope(record);
  const rejections: CliRejection[] = envelopeResult.rejections.map(toCliRejection);

  const requiresResult = validateRecordRequires(record);
  rejections.push(...requiresResult);

  const ok = rejections.length === 0;
  writeStdoutJson({ ok, rejections });
  return ok ? 0 : 1;
}

async function hashCommand(argv: readonly string[]): Promise<number> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "body":
      return hashBodyCommand(rest);
    case "metadata":
      return hashMetadataCommand(rest);
    default:
      throw usageError(`Unknown hash subcommand: ${subcommand ?? "(none)"}`);
  }
}

async function hashBodyCommand(argv: readonly string[]): Promise<number> {
  const { dir, entry } = parseDirEntryFlags(argv, "hash body");
  const body = await ingestDirectory(dir);
  const bodyHash = computeFrontmatterBodyHash({
    files: body.files,
    symlinks: body.symlinks,
    entryFile: entry,
  });

  writeStdoutJson(bodyHash);
  return 0;
}

async function hashMetadataCommand(argv: readonly string[]): Promise<number> {
  if (argv.length !== 1) {
    throw usageError("hash metadata expects exactly one input");
  }

  writeStdoutJson(computeMetadataHash(await readJsonInput(argv[0])));
  return 0;
}

async function ingestCommand(argv: readonly string[]): Promise<number> {
  const { dir, entry } = parseDirEntryFlags(argv, "ingest");
  const body = await ingestDirectory(dir);
  const bodyHash = computeFrontmatterBodyHash({
    files: body.files,
    symlinks: body.symlinks,
    entryFile: entry,
  });
  const manifest = buildDirectoryManifest({
    files: body.files,
    symlinks: body.symlinks,
    entryFile: entry,
    excludeRootSidecar: true,
  });

  writeStdoutJson({
    classification: bodyHash.classification,
    body_hash: {
      algorithm: bodyHash.algorithm,
      value: bodyHash.value,
    },
    manifest: manifest.entries,
  });
  return 0;
}

function validateRecordRequires(record: unknown): CliRejection[] {
  const envelopeRecord = selectEnvelopeRecord(record);
  const kind = envelopeRecord?.kind;
  if (envelopeRecord === undefined || !isRequiresContentType(kind)) {
    return [];
  }

  const extensionBlock = envelopeRecord[extensionBlockKey(kind)];
  const requires = isJsonRecord(extensionBlock) && Object.hasOwn(extensionBlock, "requires")
    ? extensionBlock.requires
    : undefined;

  return validateRequiresSlotForContentType(kind, requires).rejections.map(toCliRejection);
}

async function ingestDirectory(root: string): Promise<IngestedBody> {
  const files: BodyFileEntry[] = [];
  const symlinks: string[] = [];

  let rootStats;
  try {
    rootStats = await lstat(root);
  } catch (error) {
    throw new CliError(`Failed to inspect directory ${root}: ${errorMessage(error)}`);
  }

  if (rootStats.isSymbolicLink()) {
    return { files, symlinks: ["."] };
  }
  if (!rootStats.isDirectory()) {
    throw new CliError(`Not a directory: ${root}`);
  }

  async function walk(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(absoluteDirectory);
    } catch (error) {
      throw new CliError(`Failed to read directory ${absoluteDirectory}: ${errorMessage(error)}`);
    }

    names.sort(compareUtf16CodeUnits);

    for (const name of names) {
      const absolutePath = join(absoluteDirectory, name);
      const relativePath = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;

      let stats;
      try {
        stats = await lstat(absolutePath);
      } catch (error) {
        throw new CliError(`Failed to inspect ${absolutePath}: ${errorMessage(error)}`);
      }

      if (stats.isSymbolicLink()) {
        symlinks.push(relativePath);
        continue;
      }

      if (stats.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      if (stats.isFile()) {
        let content: Uint8Array;
        try {
          content = await readFile(absolutePath);
        } catch (error) {
          throw new CliError(`Failed to read ${absolutePath}: ${errorMessage(error)}`);
        }
        files.push({ path: relativePath, content });
      }
    }
  }

  await walk(root, "");
  return { files, symlinks };
}

function parseDirEntryFlags(argv: readonly string[], commandName: string): { readonly dir: string; readonly entry: string } {
  const parsed = parseOptions(argv, new Set(["dir", "entry"]));
  if (parsed.positionals.length > 0) {
    throw usageError(`${commandName} does not accept positional arguments`);
  }

  const dir = parsed.flags.get("dir");
  const entry = parsed.flags.get("entry");
  if (dir === undefined || entry === undefined) {
    throw usageError(`${commandName} requires --dir <path> and --entry <name>`);
  }

  return { dir, entry };
}

function parseOptions(argv: readonly string[], allowedFlags: ReadonlySet<string>): ParsedOptions {
  const positionals: string[] = [];
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const flag = arg.slice(2);
    if (!allowedFlags.has(flag)) {
      throw usageError(`Unknown flag: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw usageError(`Missing value for ${arg}`);
    }

    flags.set(flag, value);
    index += 1;
  }

  return { positionals, flags };
}

async function readJsonInput(pathOrStdin: string): Promise<unknown> {
  const label = pathOrStdin === "-" ? "stdin" : pathOrStdin;
  const text = await readTextInput(pathOrStdin);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`Failed to parse JSON from ${label}: ${errorMessage(error)}`);
  }
}

async function readTextInput(pathOrStdin: string): Promise<string> {
  if (pathOrStdin === "-") {
    return readStdinText();
  }

  try {
    return new TextDecoder().decode(await readFile(pathOrStdin));
  } catch (error) {
    throw new CliError(`Failed to read ${pathOrStdin}: ${errorMessage(error)}`);
  }
}

async function readStdinText(): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";

  try {
    for await (const chunk of process.stdin) {
      text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    }
  } catch (error) {
    throw new CliError(`Failed to read stdin: ${errorMessage(error)}`);
  }

  return text + decoder.decode();
}

function selectEnvelopeRecord(record: unknown): JsonRecord | undefined {
  if (!isJsonRecord(record)) {
    return undefined;
  }
  return isJsonRecord(record.publisher_section) ? record.publisher_section : record;
}

function extensionBlockKey(kind: AcifRequiresContentType): string {
  return kind === "mcp_config" ? "mcp" : kind;
}

function isRequiresContentType(value: unknown): value is AcifRequiresContentType {
  return typeof value === "string" && REQUIRES_CONTENT_TYPES.has(value);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCliRejection(rejection: { readonly id: string; readonly params?: Readonly<Record<string, unknown>> }): CliRejection {
  if (rejection.params === undefined) {
    return { id: rejection.id };
  }
  return { id: rejection.id, params: rejection.params };
}

function writeStdoutJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usageError(message: string): CliError {
  return new CliError(`${message}\n${usageText()}`);
}

function usageText(): string {
  return [
    "Usage:",
    "  acif validate <record.json|->",
    "  acif hash body --dir <path> --entry <name>",
    "  acif hash metadata <publisher_section.json|->",
    "  acif ingest --dir <path> --entry <name>",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatUnexpectedError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function compareUtf16CodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}
