import { createHash } from "node:crypto";

import { canonicalJson, canonicalJsonBytes } from "./canonical";
import { canonicalizeHook } from "./hook";

export const BODY_HASH_ALGORITHM = "sha256" as const;
export const REGISTRY_SIDECAR_FILENAME = "acif-sidecar.yaml";

export type BodyHashAlgorithm = typeof BODY_HASH_ALGORITHM;

export interface BodyHash {
  algorithm: BodyHashAlgorithm;
  value: string;
}

export type FrontmatterBodyClassification = "single-file" | "multi-file";

export interface FrontmatterBodyHash extends BodyHash {
  classification: FrontmatterBodyClassification;
}

export type BodyFileContent = string | Uint8Array;

export interface BodyFileEntry {
  path: string;
  content: BodyFileContent;
}

export type BodyFileMap =
  | Readonly<Record<string, BodyFileContent>>
  | ReadonlyMap<string, BodyFileContent>
  | readonly BodyFileEntry[];

export interface InMemoryBody {
  files: BodyFileMap;
  symlinks?: readonly string[];
}

export interface FrontmatterBodyHashInput extends InMemoryBody {
  entryFile: string;
}

export interface BodyHashManifestEntry {
  path: string;
  hash: string;
}

export interface DirectoryManifest {
  entries: readonly BodyHashManifestEntry[];
  bytes: Uint8Array;
  value: string;
}

export type AcifBodyHashErrorId =
  | "acif.body.symlink"
  | "acif.body.path_collision"
  | "acif.body.empty"
  | "acif.hook.event_unrecognized"
  | "acif.hook.handlers_missing"
  | "acif.hook.handler_type_unrecognized"
  | "acif.hook.script_os_invalid"
  | "acif.hook.script_os_empty"
  | "acif.hook.script_arch_empty"
  | "acif.hook.script_default_ambiguous"
  | "acif.hook.script_platform_ambiguous"
  | "acif.hook.script_file_missing"
  | "acif.hook.script_path_invalid"
  | "acif.hook.script_no_platform_match"
  | "acif.hook.platform_mechanism_malformed"
  | "acif.hook.platform_unmappable"
  | "acif.requires.orphan_key"
  | "acif.mcp.servers_missing"
  | "acif.mcp.transport_type_invalid"
  | "acif.mcp.transport_default_ambiguous"
  | "acif.mcp.transport_default_undetermined";

export class AcifBodyHashError extends Error {
  readonly id: AcifBodyHashErrorId;
  readonly code: AcifBodyHashErrorId;
  readonly params?: Readonly<Record<string, unknown>>;

  constructor(id: AcifBodyHashErrorId, message?: string, params?: Readonly<Record<string, unknown>>) {
    super(message ?? id);
    this.name = "AcifBodyHashError";
    this.id = id;
    this.code = id;
    this.params = params;
  }
}

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".rst",
  ".yaml",
  ".yml",
  ".json",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".css",
  ".scss",
  ".less",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".lua",
  ".rs",
  ".go",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".csv",
  ".tsv",
  ".sql",
  ".lock",
  ".sum",
  ".mod",
]);

const VERSION_CONTROL_DIRECTORIES = new Set([".git", ".svn", ".hg", ".bzr", "_darcs", ".fossil"]);
const SHA256_EMPTY_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const UTF8 = new TextEncoder();

export type BodyHashInput =
  | ({ kind: "frontmatter" } & FrontmatterBodyHashInput)
  | { kind: "hook"; hook: unknown; files?: BodyFileMap; symlinks?: readonly string[] }
  | { kind: "mcp_config"; mcp: unknown };

export function computeBodyHash(input: BodyHashInput): BodyHash {
  switch (input.kind) {
    case "frontmatter":
      return computeFrontmatterBodyHash(input);
    case "hook":
      return computeHookBodyHash(input.hook, { files: input.files ?? {}, symlinks: input.symlinks });
    case "mcp_config":
      return computeMcpBodyHash(input.mcp);
  }
}

export function computeFrontmatterBodyHash(input: FrontmatterBodyHashInput): FrontmatterBodyHash {
  const files = collectFiles(input.files);
  assertNoSymlinks(input.symlinks);
  assertNoPathCollisions(files);

  const entryFile = normalizeRelativePath(input.entryFile);
  const classification = classifyFrontmatterBody({ files, entryFile });

  if (classification === "single-file") {
    const entry = files.find((file) => file.normalizedPath === entryFile && isHashIncludedFile(file));
    if (entry === undefined) {
      throw new AcifBodyHashError("acif.body.empty");
    }
    return {
      algorithm: BODY_HASH_ALGORITHM,
      value: sha256Hex(stripEntryFrontmatter(normalizeTextBytes(entry.content))),
      classification,
    };
  }

  const manifest = buildDirectoryManifest({
    files,
    entryFile,
    excludeRootSidecar: true,
  });

  return {
    algorithm: BODY_HASH_ALGORITHM,
    value: manifest.value,
    classification,
  };
}

export function classifyFrontmatterBody(input: {
  files: BodyFileMap | readonly NormalizedBodyFile[];
  entryFile: string;
  symlinks?: readonly string[];
}): FrontmatterBodyClassification {
  assertNoSymlinks(input.symlinks);

  const files = isNormalizedBodyFileArray(input.files) ? input.files : collectFiles(input.files);
  assertNoPathCollisions(files);

  const entryFile = normalizeRelativePath(input.entryFile);
  const contentFiles = files.filter(
    (file) =>
      isHashIncludedFile(file) &&
      !isRootLicenseOrReadme(file.normalizedPath) &&
      file.normalizedPath !== REGISTRY_SIDECAR_FILENAME,
  );

  if (contentFiles.length === 0) {
    throw new AcifBodyHashError("acif.body.empty");
  }

  return contentFiles.some((file) => file.normalizedPath !== entryFile) ? "multi-file" : "single-file";
}

export function buildDirectoryManifest(input: {
  files: BodyFileMap | readonly NormalizedBodyFile[];
  entryFile?: string;
  symlinks?: readonly string[];
  excludeRootSidecar?: boolean;
}): DirectoryManifest {
  assertNoSymlinks(input.symlinks);

  const files = isNormalizedBodyFileArray(input.files) ? input.files : collectFiles(input.files);
  assertNoPathCollisions(files);

  const entryFile = input.entryFile === undefined ? undefined : normalizeRelativePath(input.entryFile);
  const manifestEntries = files
    .filter((file) => isHashIncludedFile(file))
    .filter((file) => !(input.excludeRootSidecar === true && file.normalizedPath === REGISTRY_SIDECAR_FILENAME))
    .map((file) => ({
      path: file.normalizedPath,
      hash:
        entryFile !== undefined && file.normalizedPath === entryFile
          ? sha256Hex(stripEntryFrontmatter(normalizeTextBytes(file.content)))
          : hashFile(file.normalizedPath, file.content),
    }))
    .sort((left, right) => compareUtf8(left.path, right.path));

  const manifestText = manifestEntries.map((entry) => `${entry.hash}  ${entry.path}\n`).join("");
  const bytes = UTF8.encode(manifestText);

  return {
    entries: manifestEntries,
    bytes,
    value: sha256Hex(bytes),
  };
}

export function hashFile(path: string, content: BodyFileContent): string {
  const bytes = toBytes(content);
  if (isTextFile(path, bytes)) {
    return sha256Hex(normalizeTextBytes(bytes));
  }
  return sha256Hex(bytes);
}

export function isTextFile(path: string, content: BodyFileContent): boolean {
  const bytes = toBytes(content);
  return TEXT_EXTENSIONS.has(finalExtension(path)) && !containsNul(bytes.subarray(0, 8192));
}

export function normalizeTextBytes(content: BodyFileContent): Uint8Array {
  const bytes = stripUtf8Bom(toBytes(content));
  const output: number[] = [];

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x0d) {
      if (bytes[index + 1] === 0x0a) {
        index += 1;
      }
      output.push(0x0a);
    } else {
      output.push(byte);
    }
  }

  return new Uint8Array(output);
}

export function stripEntryFrontmatter(canonicalText: BodyFileContent): Uint8Array {
  const bytes = toBytes(canonicalText);
  if (!startsWithLine(bytes, 0, "---")) {
    return bytes;
  }

  let lineStart = nextLineStart(bytes, 0);
  while (lineStart < bytes.length) {
    if (startsWithLine(bytes, lineStart, "---")) {
      return bytes.subarray(nextLineStart(bytes, lineStart));
    }
    lineStart = nextLineStart(bytes, lineStart);
  }

  return bytes;
}

export function computeHookBodyHash(hook: unknown, body: InMemoryBody = { files: {} }): BodyHash {
  const files = collectFiles(body.files);
  assertNoSymlinks(body.symlinks);
  assertNoPathCollisions(files);

  const normalizedFiles = new Map(files.map((file) => [file.normalizedPath, file]));
  const canonicalHook = normalizeHookWiring(canonicalizeHook(hook));
  const referencedPaths = hookReferencedFilePaths(canonicalHook);

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

  manifestEntries.sort((left, right) => compareUtf8(left.path, right.path));
  const manifestBytes = UTF8.encode(manifestEntries.map((entry) => `${entry.hash}  ${entry.path}\n`).join(""));
  const directoryHash = `sha256:${sha256Hex(manifestBytes)}`;
  const preimage = concatBytes(UTF8.encode(`${directoryHash}\n`), canonicalJsonBytes(canonicalHook), UTF8.encode("\n"));

  return {
    algorithm: BODY_HASH_ALGORITHM,
    value: sha256Hex(preimage),
  };
}

export function computeMcpBodyHash(mcp: unknown): BodyHash {
  const canonicalMcp = normalizeMcpWiring(mcp);
  const preimage = concatBytes(
    UTF8.encode(`sha256:${SHA256_EMPTY_HEX}\n`),
    canonicalJsonBytes(canonicalMcp),
    UTF8.encode("\n"),
  );

  return {
    algorithm: BODY_HASH_ALGORITHM,
    value: sha256Hex(preimage),
  };
}

export function canonicalizeCommandPlaceholders(body: string): string {
  let output = "";
  for (let index = 0; index < body.length; ) {
    if (body.startsWith("{{args}}", index)) {
      output += "$ARGUMENTS";
      index += "{{args}}".length;
      continue;
    }

    const named = readNamedCommandPlaceholder(body, index);
    if (named !== undefined) {
      output += "$ARGUMENTS";
      index = named.end;
      continue;
    }

    output += body[index];
    index += 1;
  }
  return output;
}

export function sha256Hex(content: BodyFileContent): string {
  return createHash("sha256").update(toBytes(content)).digest("hex");
}

interface NormalizedBodyFile {
  readonly sourcePath: string;
  readonly normalizedPath: string;
  readonly content: BodyFileContent;
}

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = null | boolean | number | string | JsonArray | JsonObject;

function collectFiles(files: BodyFileMap): NormalizedBodyFile[] {
  const entries: BodyFileEntry[] = [];

  if (files instanceof Map) {
    for (const [path, content] of files.entries()) {
      entries.push({ path, content });
    }
  } else if (Array.isArray(files)) {
    entries.push(...files);
  } else {
    for (const [path, content] of Object.entries(files)) {
      entries.push({ path, content });
    }
  }

  return entries.map(({ path, content }) => ({
    sourcePath: path,
    normalizedPath: normalizeRelativePath(path),
    content,
  }));
}

function isNormalizedBodyFileArray(value: BodyFileMap | readonly NormalizedBodyFile[]): value is readonly NormalizedBodyFile[] {
  return Array.isArray(value) && value.every((entry) => "sourcePath" in entry && "normalizedPath" in entry);
}

function assertNoSymlinks(symlinks?: readonly string[]): void {
  if (symlinks !== undefined && symlinks.length > 0) {
    throw new AcifBodyHashError("acif.body.symlink", undefined, { path: symlinks[0] });
  }
}

function assertNoPathCollisions(files: readonly NormalizedBodyFile[]): void {
  const seen = new Map<string, string>();
  for (const file of files) {
    if (hasVersionControlDirectory(file.normalizedPath)) {
      continue;
    }

    const existing = seen.get(file.normalizedPath);
    if (existing !== undefined && existing !== file.sourcePath) {
      throw new AcifBodyHashError("acif.body.path_collision", undefined, {
        path: file.normalizedPath,
        first: existing,
        second: file.sourcePath,
      });
    }
    seen.set(file.normalizedPath, file.sourcePath);
  }
}

function isHashIncludedFile(file: NormalizedBodyFile): boolean {
  return !hasVersionControlDirectory(file.normalizedPath);
}

function normalizeRelativePath(path: string): string {
  return path.normalize("NFC");
}

function hasVersionControlDirectory(path: string): boolean {
  return path.split("/").some((component) => VERSION_CONTROL_DIRECTORIES.has(component));
}

function isRootLicenseOrReadme(path: string): boolean {
  if (path.includes("/")) {
    return false;
  }
  const lower = path.toLowerCase();
  return lower.startsWith("license") || lower.startsWith("readme");
}

function finalExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) {
    return "";
  }
  return filename.slice(lastDot).toLowerCase();
}

function containsNul(bytes: Uint8Array): boolean {
  return bytes.includes(0x00);
}

function stripUtf8Bom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function startsWithLine(bytes: Uint8Array, lineStart: number, line: string): boolean {
  const lineBytes = UTF8.encode(line);
  if (lineStart + lineBytes.length > bytes.length) {
    return false;
  }
  for (let index = 0; index < lineBytes.length; index += 1) {
    if (bytes[lineStart + index] !== lineBytes[index]) {
      return false;
    }
  }
  const lineEnd = lineStart + lineBytes.length;
  return lineEnd === bytes.length || bytes[lineEnd] === 0x0a;
}

function nextLineStart(bytes: Uint8Array, lineStart: number): number {
  const newlineIndex = bytes.indexOf(0x0a, lineStart);
  return newlineIndex === -1 ? bytes.length : newlineIndex + 1;
}

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

function toBytes(content: BodyFileContent): Uint8Array {
  return typeof content === "string" ? UTF8.encode(content) : content;
}

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

function normalizeHookWiring(value: unknown): JsonObject {
  const hook = asPlainObject(value, "hook");
  const handlers = hook.handlers;
  if (!Array.isArray(handlers) || handlers.length === 0) {
    throw new AcifBodyHashError("acif.hook.handlers_missing");
  }

  const output = cloneJsonObject(hook);
  output.handlers = handlers.map((handler, index) => normalizeHookHandler(handler, index));
  output.blocking = "blocking" in hook ? cloneJsonValue(hook.blocking) : false;

  if (Array.isArray(hook.auxiliary_files)) {
    output.auxiliary_files = uniqueAuxiliaryFiles(hook.auxiliary_files);
  }

  if (isEmptyObject(output.requires)) {
    delete output.requires;
  }

  return output;
}

function normalizeHookHandler(value: unknown, handlerIndex: number): JsonObject {
  const handler = asPlainObject(value, `hook.handlers[${handlerIndex}]`);
  const typeValue = handler.type === "" || handler.type === undefined ? "command" : handler.type;
  if (typeValue !== "command" && typeValue !== "http" && typeValue !== "prompt" && typeValue !== "agent") {
    throw new AcifBodyHashError("acif.hook.handler_type_unrecognized", undefined, {
      handler: handlerIndex,
      type: typeValue,
    });
  }

  const output = cloneJsonObject(handler);
  output.type = typeValue;

  if (typeValue === "command") {
    const scripts = output.scripts;
    if (!Array.isArray(scripts) || scripts.length === 0) {
      throw new AcifBodyHashError("acif.hook.handlers_missing");
    }

    const normalizedScripts = scripts.map((script, scriptIndex) =>
      normalizeHookScript(script, handlerIndex, scriptIndex),
    );
    validateScriptDisjointness(normalizedScripts);
    output.scripts = normalizedScripts.sort((left, right) => compareUtf8(canonicalJson(left), canonicalJson(right)));
    output.async = "async" in handler ? cloneJsonValue(handler.async) : false;
  }

  return output;
}

function normalizeHookScript(value: unknown, handlerIndex: number, scriptIndex: number): JsonObject {
  const script = asPlainObject(value, `hook.handlers[${handlerIndex}].scripts[${scriptIndex}]`);
  const output = cloneJsonObject(script);
  output.__source_index = scriptIndex;

  if ("os" in script) {
    output.os = normalizeOsSet(script.os, scriptIndex);
  }
  if ("arch" in script) {
    output.arch = normalizeStringSet(script.arch, "acif.hook.script_arch_empty", { script: scriptIndex });
  }
  if (script.type === "file" && typeof script.path === "string") {
    output.path = normalizeHookReferencedPath(script.path);
  }
  if (script.type === "inline" && typeof script.content === "string") {
    output.content = textBytesToString(normalizeTextBytes(script.content));
  }

  return output;
}

function validateScriptDisjointness(scripts: readonly JsonObject[]): void {
  const defaultScripts = scripts.filter((script) => !("os" in script));
  if (defaultScripts.length > 1) {
    throw new AcifBodyHashError("acif.hook.script_default_ambiguous");
  }

  const seenByOs = new Map<string, number>();
  for (const script of scripts) {
    if (!Array.isArray(script.os)) {
      continue;
    }

    for (const os of script.os) {
      if (typeof os !== "string") {
        continue;
      }
      const sourceIndex = typeof script.__source_index === "number" ? script.__source_index : -1;
      const existing = seenByOs.get(os);
      if (existing !== undefined) {
        throw new AcifBodyHashError("acif.hook.script_platform_ambiguous", undefined, {
          os,
          entries: [existing, sourceIndex],
        });
      }
      seenByOs.set(os, sourceIndex);
    }
  }

  for (const script of scripts) {
    delete script.__source_index;
  }
}

function normalizeOsSet(value: unknown, scriptIndex: number): JsonArray {
  const values = normalizeStringSet(value, "acif.hook.script_os_empty", { script: scriptIndex });
  for (const os of values) {
    if (os !== "darwin" && os !== "linux" && os !== "windows") {
      throw new AcifBodyHashError("acif.hook.script_os_invalid", undefined, { os, script: scriptIndex });
    }
  }
  return values;
}

function normalizeStringSet(
  value: unknown,
  emptyError: AcifBodyHashErrorId,
  params?: Readonly<Record<string, unknown>>,
): JsonArray {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AcifBodyHashError(emptyError, undefined, params);
  }

  const strings = value.map((item) => {
    if (typeof item !== "string") {
      return String(item);
    }
    return item;
  });

  return Array.from(new Set(strings)).sort(compareUtf8);
}

function normalizePossiblyEmptyStringSet(value: readonly unknown[]): JsonArray {
  const strings = value.map((item) => {
    if (typeof item !== "string") {
      return String(item);
    }
    return item;
  });

  return Array.from(new Set(strings)).sort(compareUtf8);
}

function uniqueAuxiliaryFiles(value: readonly unknown[]): JsonArray {
  const byPath = new Map<string, JsonObject>();
  for (const entry of value) {
    const object = cloneJsonObject(asPlainObject(entry, "hook.auxiliary_files[]"));
    if (typeof object.path !== "string") {
      continue;
    }
    const normalizedPath = normalizeHookReferencedPath(object.path);
    if (!byPath.has(normalizedPath)) {
      object.path = normalizedPath;
      byPath.set(normalizedPath, object);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => compareUtf8(String(left.path), String(right.path)));
}

function hookReferencedFilePaths(hook: JsonObject): string[] {
  const paths = new Set<string>();

  for (const handler of hook.handlers as JsonArray) {
    if (!isJsonObject(handler) || !Array.isArray(handler.scripts)) {
      continue;
    }

    for (const script of handler.scripts) {
      if (isJsonObject(script) && script.type === "file" && typeof script.path === "string") {
        paths.add(normalizeHookReferencedPath(script.path));
      }
    }
  }

  if (Array.isArray(hook.auxiliary_files)) {
    for (const entry of hook.auxiliary_files) {
      if (isJsonObject(entry) && typeof entry.path === "string") {
        paths.add(normalizeHookReferencedPath(entry.path));
      }
    }
  }

  return Array.from(paths);
}

function normalizeHookReferencedPath(path: string): string {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\")
  ) {
    throw new AcifBodyHashError("acif.hook.script_path_invalid", undefined, { path });
  }

  const normalizedPath = path.normalize("NFC");
  const segments = normalizedPath.split("/");
  if (segments.some((segment) => segment === "." || segment === ".." || segment === "")) {
    throw new AcifBodyHashError("acif.hook.script_path_invalid", undefined, { path });
  }
  return normalizedPath;
}

function normalizeMcpWiring(value: unknown): JsonObject {
  const mcp = asPlainObject(value, "mcp");
  const servers = asOptionalPlainObject(mcp.servers);
  if (servers === undefined || Object.keys(servers).length === 0) {
    throw new AcifBodyHashError("acif.mcp.servers_missing");
  }

  const output = cloneJsonObject(mcp);
  const normalizedServers: JsonObject = {};
  for (const [name, server] of Object.entries(servers)) {
    normalizedServers[name] = normalizeMcpServer(server, name);
  }
  output.servers = normalizedServers;

  if (isEmptyObject(output.requires)) {
    delete output.requires;
  }

  return output;
}

function normalizeMcpServer(value: unknown, name: string): JsonObject {
  const server = asPlainObject(value, `mcp.servers[${JSON.stringify(name)}]`);
  const output = cloneJsonObject(server);
  const hasType = typeof server.type === "string";
  const hasCommand = "command" in server && server.command !== undefined;
  const hasUrl = "url" in server && server.url !== undefined;

  if (hasType) {
    if (server.type !== "stdio" && server.type !== "sse" && server.type !== "streamable-http") {
      throw new AcifBodyHashError("acif.mcp.transport_type_invalid", undefined, { server: name, type: server.type });
    }
  } else if (hasCommand && !hasUrl) {
    output.type = "stdio";
  } else if (hasUrl && !hasCommand) {
    output.type = "streamable-http";
  } else if (hasCommand && hasUrl) {
    throw new AcifBodyHashError("acif.mcp.transport_default_ambiguous", undefined, { server: name });
  } else {
    throw new AcifBodyHashError("acif.mcp.transport_default_undetermined", undefined, { server: name });
  }

  for (const key of ["includeTools", "excludeTools", "disabledTools", "autoApprove"]) {
    if (Array.isArray(output[key])) {
      output[key] = normalizePossiblyEmptyStringSet(output[key]);
    }
  }

  return output;
}

function asPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (!isJsonObjectLike(value)) {
    throw new Error(`Expected plain object at ${path}`);
  }
  return value;
}

function asOptionalPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asPlainObject(value, "object");
}

function cloneJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    throw new Error("Value is not JSON-compatible: undefined");
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const output: JsonArray = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new Error("Value is not JSON-compatible: sparse array");
      }
      output.push(cloneJsonValue(value[index]));
    }
    return output;
  }
  if (isJsonObjectLike(value)) {
    return cloneJsonObject(value);
  }
  throw new Error(`Value is not JSON-compatible: ${typeof value}`);
}

function cloneJsonObject(value: Record<string, unknown>): JsonObject {
  const output: JsonObject = {};
  for (const [key, member] of Object.entries(value)) {
    if (member !== undefined) {
      output[key] = cloneJsonValue(member);
    }
  }
  return output;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEmptyObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && isJsonObject(value) && Object.keys(value).length === 0;
}

function textBytesToString(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function readNamedCommandPlaceholder(body: string, start: number): { end: number } | undefined {
  if (!body.startsWith("${input:", start)) {
    return undefined;
  }

  let index = start + "${input:".length;
  const nameStart = index;
  while (index < body.length && /[A-Za-z0-9_-]/.test(body[index])) {
    index += 1;
  }
  if (index === nameStart) {
    return undefined;
  }

  if (body[index] === "}") {
    return { end: index + 1 };
  }

  if (body[index] !== ":") {
    return undefined;
  }

  index += 1;
  while (index < body.length && body[index] !== "}") {
    index += 1;
  }
  return body[index] === "}" ? { end: index + 1 } : undefined;
}
