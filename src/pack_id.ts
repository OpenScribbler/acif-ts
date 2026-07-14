import { createHash } from "node:crypto";

export const ACIF_PACK_NAMESPACE = "93516344-00e5-419b-a230-6e8b1d02f87d" as const;
export const PACK_INFERENCE_VERSION = "v0.1" as const;
export const ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID = "acif.publisher.pack_source_conflict" as const;

export const PACK_MANIFEST_PRECEDENCE = [
  "package.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "gemini-extension.json",
] as const;

export type PackManifestSource = (typeof PACK_MANIFEST_PRECEDENCE)[number];
export type PackCanonicalSource = PackManifestSource | "directory-adjacency";
export type PackInferenceVersion = typeof PACK_INFERENCE_VERSION;
export type AcifPublisherPackDiagnosticId = typeof ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID;

export interface PackManifestEntry {
  readonly source: string;
  readonly manifest?: unknown;
  readonly name?: unknown;
}

export type PackManifestMap =
  | Readonly<Record<string, unknown>>
  | ReadonlyMap<string, unknown>
  | readonly PackManifestEntry[];

export interface AcifPublisherPackSourceConflict {
  readonly id: typeof ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID;
  readonly code: typeof ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID;
  readonly params: Readonly<{
    readonly names_sources: readonly string[];
    readonly names_values: readonly string[];
  }>;
}

export type AcifPublisherPackDiagnostic = AcifPublisherPackSourceConflict;

export interface PackInferenceInput {
  readonly repositoryUrl: string;
  readonly manifests?: PackManifestMap;
}

export interface PackInferenceResult {
  readonly canonicalSource: PackCanonicalSource;
  readonly canonicalDisplayName: string;
  readonly canonicalRepositoryUrl: string;
  readonly inferredPackId: string;
  readonly canonicalAddress: string;
  readonly inferenceVersion: PackInferenceVersion;
  readonly diagnostics: readonly AcifPublisherPackDiagnostic[];
}

export interface InferredPackRecord {
  readonly kind: "pack";
  readonly id: string;
  readonly display_name: string;
  readonly repository_url: string;
  readonly pack: Readonly<{
    readonly source_kind: "inferred";
    readonly canonical_address: string;
    readonly inference_version: PackInferenceVersion;
  }>;
}

export type PackResolution = "declared" | "inferred" | "unresolved";
export type PackInstallDecision = "proceed" | "refuse-unless-operator-opt-in";

export interface PackMembershipResolution {
  readonly memberOf?: string;
  readonly packResolution?: PackResolution;
  readonly install: PackInstallDecision;
}

type JsonRecord = Record<string, unknown>;

interface NamedPackSource {
  readonly source: PackManifestSource;
  readonly name: string;
}

const UTF8 = new TextEncoder();
const PACK_MANIFEST_SOURCE_SET = new Set<string>(PACK_MANIFEST_PRECEDENCE);

export function inferPackId(input: PackInferenceInput): PackInferenceResult {
  const canonicalRepositoryUrl = canonicalizeRepositoryUrlForPackInference(input.repositoryUrl);
  const source = selectCanonicalDisplayName(input.manifests, canonicalRepositoryUrl);
  const inferredPackId = deriveInferredPackId(canonicalRepositoryUrl, source.canonicalDisplayName);

  return {
    canonicalSource: source.canonicalSource,
    canonicalDisplayName: source.canonicalDisplayName,
    canonicalRepositoryUrl,
    inferredPackId,
    canonicalAddress: canonicalAddressForPackInference(canonicalRepositoryUrl, source.canonicalDisplayName),
    inferenceVersion: PACK_INFERENCE_VERSION,
    diagnostics: source.diagnostics,
  };
}

export const inferPackIdentity = inferPackId;

export function buildInferredPackRecord(input: PackInferenceInput): {
  readonly record: InferredPackRecord;
  readonly diagnostics: readonly AcifPublisherPackDiagnostic[];
} {
  const inference = inferPackId(input);

  return {
    record: {
      kind: "pack",
      id: inference.inferredPackId,
      display_name: inference.canonicalDisplayName,
      repository_url: inference.canonicalRepositoryUrl,
      pack: {
        source_kind: "inferred",
        canonical_address: inference.canonicalAddress,
        inference_version: inference.inferenceVersion,
      },
    },
    diagnostics: inference.diagnostics,
  };
}

export function canonicalizeRepositoryUrlForPackInference(repositoryUrl: string): string {
  if (repositoryUrl.length === 0) {
    throw new TypeError("repositoryUrl must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(rewriteScpRepositoryUrl(repositoryUrl));
  } catch (cause) {
    throw new TypeError("repositoryUrl must be an absolute repository fetch URL", { cause });
  }

  parsed.protocol = "https:";
  parsed.username = "";
  parsed.password = "";

  let pathname = parsed.pathname.replace(/\/+$/u, "");
  if (pathname.toLowerCase().endsWith(".git")) {
    pathname = pathname.slice(0, -".git".length);
  }

  return `https://${parsed.host}${pathname}${parsed.search}${parsed.hash}`.toLowerCase();
}

export function deriveInferredPackId(
  canonicalRepositoryUrl: string,
  canonicalDisplayName: string,
): string {
  return uuidV5(ACIF_PACK_NAMESPACE, `${canonicalRepositoryUrl}\n${canonicalDisplayName}`);
}

export function canonicalAddressForPackInference(
  canonicalRepositoryUrl: string,
  canonicalDisplayName: string,
): string {
  const parsed = parseCanonicalRepositoryUrl(canonicalRepositoryUrl);
  const segments = pathSegments(parsed);
  if (segments.length < 2) {
    throw new TypeError("canonicalRepositoryUrl must include owner and repository path segments");
  }

  const host = parsed.hostname;
  let owner: string;
  if (host === "github.com" || host === "bitbucket.org") {
    owner = segments[segments.length - 2];
  } else if (host === "gitlab.com") {
    owner = segments.slice(0, -1).join("/");
  } else if (host === "git.sr.ht") {
    owner = segments[0].replace(/^~/u, "");
  } else {
    owner = segments[0];
  }

  return `${owner}/${canonicalDisplayName}`;
}

export function isPackMember(item: unknown, pack: unknown): boolean {
  const packId = packIdFromPackReference(pack);
  if (packId === undefined) {
    return false;
  }

  const declared = declaredPackIdSlot(item);
  if (declared.present) {
    return declared.value === packId;
  }

  return inferredPackId(item) === packId;
}

export function resolvePackMembership(
  item: unknown,
  knownPacks?: Iterable<string | { readonly id?: unknown }>,
): PackMembershipResolution {
  const declared = declaredPackIdSlot(item);
  if (declared.present) {
    if (typeof declared.value !== "string") {
      return { install: "proceed" };
    }

    const knownPackIds = knownPacks === undefined ? undefined : collectKnownPackIds(knownPacks);
    if (knownPackIds !== undefined && !knownPackIds.has(declared.value)) {
      return {
        memberOf: declared.value,
        packResolution: "unresolved",
        install: "refuse-unless-operator-opt-in",
      };
    }

    return {
      memberOf: declared.value,
      packResolution: "declared",
      install: "proceed",
    };
  }

  const inferred = inferredPackId(item);
  if (inferred !== undefined) {
    return {
      memberOf: inferred,
      packResolution: "inferred",
      install: "proceed",
    };
  }

  return { install: "proceed" };
}

function selectCanonicalDisplayName(
  manifests: PackManifestMap | undefined,
  canonicalRepositoryUrl: string,
): {
  readonly canonicalSource: PackCanonicalSource;
  readonly canonicalDisplayName: string;
  readonly diagnostics: readonly AcifPublisherPackDiagnostic[];
} {
  const namedSources = collectNamedManifestSources(manifests);
  const winner = namedSources[0];

  if (winner !== undefined) {
    return {
      canonicalSource: winner.source,
      canonicalDisplayName: winner.name,
      diagnostics: packSourceConflictDiagnostics(winner, namedSources),
    };
  }

  return {
    canonicalSource: "directory-adjacency",
    canonicalDisplayName: repositoryBasename(canonicalRepositoryUrl),
    diagnostics: [],
  };
}

function collectNamedManifestSources(manifests: PackManifestMap | undefined): readonly NamedPackSource[] {
  const namesBySource = collectManifestNamesBySource(manifests);
  const namedSources: NamedPackSource[] = [];

  for (const source of PACK_MANIFEST_PRECEDENCE) {
    const name = namesBySource.get(source);
    if (typeof name !== "string") {
      continue;
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 0) {
      namedSources.push({ source, name: trimmedName });
    }
  }

  return namedSources;
}

function collectManifestNamesBySource(manifests: PackManifestMap | undefined): Map<PackManifestSource, unknown> {
  const namesBySource = new Map<PackManifestSource, unknown>();
  if (manifests === undefined) {
    return namesBySource;
  }

  if (Array.isArray(manifests)) {
    for (const entry of manifests) {
      addManifestName(namesBySource, entry.source, manifestEntryName(entry));
    }
    return namesBySource;
  }

  if (manifests instanceof Map) {
    for (const [source, manifest] of manifests) {
      addManifestName(namesBySource, source, manifestName(manifest));
    }
    return namesBySource;
  }

  for (const [source, manifest] of Object.entries(manifests)) {
    addManifestName(namesBySource, source, manifestName(manifest));
  }

  return namesBySource;
}

function addManifestName(
  namesBySource: Map<PackManifestSource, unknown>,
  source: string,
  name: unknown,
): void {
  if (isPackManifestSource(source) && !namesBySource.has(source)) {
    namesBySource.set(source, name);
  }
}

function manifestEntryName(entry: PackManifestEntry): unknown {
  if (Object.hasOwn(entry, "name")) {
    return entry.name;
  }
  return manifestName(entry.manifest);
}

function manifestName(manifest: unknown): unknown {
  if (typeof manifest === "string") {
    return manifest;
  }
  if (isJsonRecord(manifest)) {
    return manifest.name;
  }
  return undefined;
}

function packSourceConflictDiagnostics(
  winner: NamedPackSource,
  namedSources: readonly NamedPackSource[],
): readonly AcifPublisherPackDiagnostic[] {
  const conflictingSources = namedSources.filter((source) => source.name !== winner.name);
  if (conflictingSources.length === 0) {
    return [];
  }

  return [
    {
      id: ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID,
      code: ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID,
      params: {
        names_sources: [winner.source, ...conflictingSources.map((source) => source.source)],
        names_values: [winner.name, ...conflictingSources.map((source) => source.name)],
      },
    },
  ];
}

function repositoryBasename(canonicalRepositoryUrl: string): string {
  const segments = pathSegments(parseCanonicalRepositoryUrl(canonicalRepositoryUrl));
  const basename = segments[segments.length - 1];
  if (basename === undefined || basename.length === 0) {
    throw new TypeError("repositoryUrl must include a repository basename");
  }
  return basename;
}

function rewriteScpRepositoryUrl(repositoryUrl: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(repositoryUrl)) {
    return repositoryUrl;
  }

  const match = /^([^@\s/]+)@([^:\s/]+):(.+)$/u.exec(repositoryUrl);
  if (match === null) {
    return repositoryUrl;
  }

  return `https://${match[2]}/${match[3].replace(/^\/+/u, "")}`;
}

function uuidV5(namespace: string, name: string): string {
  const digest = createHash("sha1").update(uuidBytes(namespace)).update(UTF8.encode(name)).digest("hex");
  const bytes = hexToBytes(digest).subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/gu, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/u.test(hex)) {
    throw new TypeError("namespace must be a UUID");
  }
  return hexToBytes(hex);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new TypeError("hex input must contain complete bytes");
  }

  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseCanonicalRepositoryUrl(canonicalRepositoryUrl: string): URL {
  try {
    return new URL(canonicalRepositoryUrl);
  } catch (cause) {
    throw new TypeError("canonicalRepositoryUrl must be an absolute URL", { cause });
  }
}

function pathSegments(url: URL): readonly string[] {
  return url.pathname.split("/").filter((segment) => segment.length > 0);
}

function declaredPackIdSlot(item: unknown): { readonly present: true; readonly value: unknown } | { readonly present: false } {
  const record = isJsonRecord(item) ? item : undefined;
  const publisherSection = isJsonRecord(record?.publisher_section) ? record.publisher_section : undefined;
  if (publisherSection !== undefined && Object.hasOwn(publisherSection, "pack_id")) {
    return { present: true, value: publisherSection.pack_id };
  }
  return { present: false };
}

function inferredPackId(item: unknown): string | undefined {
  const record = isJsonRecord(item) ? item : undefined;
  const registrySection = isJsonRecord(record?.registry_section) ? record.registry_section : undefined;
  return typeof registrySection?.inferred_pack_id === "string" ? registrySection.inferred_pack_id : undefined;
}

function packIdFromPackReference(pack: unknown): string | undefined {
  if (typeof pack === "string") {
    return pack;
  }
  if (isJsonRecord(pack) && typeof pack.id === "string") {
    return pack.id;
  }
  return undefined;
}

function collectKnownPackIds(knownPacks: Iterable<string | { readonly id?: unknown }>): Set<string> {
  const ids = new Set<string>();
  for (const pack of knownPacks) {
    const id = packIdFromPackReference(pack);
    if (id !== undefined) {
      ids.add(id);
    }
  }
  return ids;
}

function isPackManifestSource(source: string): source is PackManifestSource {
  return PACK_MANIFEST_SOURCE_SET.has(source);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
