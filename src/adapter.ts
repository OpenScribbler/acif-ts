import { readFile } from "node:fs/promises";

import { AcifBodyHashError, computeFrontmatterBodyHash, computeHookBodyHash, computeMcpBodyHash, getReferencedFilePaths } from "./body_hash";
import { canonicalJson } from "./canonical";
import { ingestDirectory } from "./cli";
import { validateEnvelope } from "./envelope";
import { computeMetadataHash, metadataHashCanonicalJson } from "./metadata_hash";
import {
  ACIF_PACK_NAMESPACE,
  canonicalizeRepositoryUrlForPackInference,
  deriveInferredPackId,
  inferPackId,
  resolvePackMembership,
} from "./pack_id";
import {
  ACIF_REQUIRES_CONTENT_TYPES,
  decideRequiresInstall,
  evaluateRequires as evaluateRequiresSlot,
  validateRequiresSlotForContentType,
  type AcifRequiresContentType,
} from "./requires";
import { projectOsCoverage, projectDerivedCapabilities, evaluateHookInstall, determineProvenanceRollup } from "./hook_project";
import { renderHookBlock } from "./hook_render";
import { canonicalizeHookWithPlatform, canonicalizeProviderPlatform, selectScript } from "./hook_platform";

type JsonRecord = Record<string, unknown>;

interface Diagnostic {
  readonly id: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

type AdapterResponse =
  | { readonly ok: true; readonly result: JsonRecord }
  | { readonly ok: false; readonly error: string; readonly diagnostics: readonly Diagnostic[] }
  | { readonly unsupported: true };

const PACKAGE_JSON_PATH = decodeURIComponent(new URL("../package.json", import.meta.url).pathname);
const UTF8 = new TextDecoder();
const FRONTMATTER_KINDS = new Set(["skill", "rule", "command", "agent"]);
const SIDECAR_ONLY_KINDS = new Set(["hook", "mcp_config"]);
const REQUIRES_CONTENT_TYPE_SET = new Set<string>(ACIF_REQUIRES_CONTENT_TYPES);
const ENVELOPE_FIELDS = ["kind", "id", "display_name", "version", "description", "license", "pack_id"] as const;
const PUBLISHER_SECTION_OMIT_FIELDS = new Set([
  "publisher_section",
  "registry_section",
  "body_hash",
  "body_size_bytes",
  "metadata_hash",
  "source_uri",
]);

let packageVersionPromise: Promise<string> | undefined;

export async function handleRequest(request: unknown): Promise<unknown> {
  try {
    return await handleRequestUnsafe(request);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      return specError(error.id, error.params);
    }
    return adapterError(errorMessage(error));
  }
}

export async function runAdapter(): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of process.stdin) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stripTrailingCarriageReturn(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      await handleLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    await handleLine(stripTrailingCarriageReturn(buffer));
  }
}

async function handleLine(line: string): Promise<void> {
  let request: unknown;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeStdoutJson(adapterError(`invalid JSON request: ${errorMessage(error)}`));
    return;
  }

  writeStdoutJson(await handleRequest(request));
}

async function handleRequestUnsafe(request: unknown): Promise<AdapterResponse> {
  const record = requireJsonRecord(request, "request");
  const op = record.op;

  if (typeof op !== "string") {
    throw new Error("malformed request: op must be a string");
  }

  if (op === "hello") {
    return ok({
      implementation: "acif-ts",
      version: await packageVersion(),
      adapter_protocol: 2,
      scopes: ["core", "hook"],
    });
  }

  const input = requireJsonRecord(record.input, "request.input");
  switch (op) {
    case "ingest":
      return ingest(input);
    case "derive_pack_id":
      return derivePackId(input);
    case "resolve_pack":
      return resolvePack(input);
    case "evaluate_requires":
      return evaluateRequires(input);
    case "project":
      return project(input);
    case "render":
      return render(input);
    case "evaluate_install":
      return evaluateInstall(input);
    default:
      return unsupported();
  }
}

async function ingest(input: JsonRecord): Promise<AdapterResponse> {
  if (input.kind === "hook" && isJsonRecord(input.provider_config)) {
    return ingestProviderConfig(input);
  }

  if (input.kind === "pack" && Array.isArray(input.manifests)) {
    return ingestPackManifests(input);
  }

  if (Object.hasOwn(input, "item_record")) {
    const record = input.item_record;
    if (isHookRecord(record)) {
      const { envelope } = normalizeHookSidecar(record);
      return ok(validateRecord(envelope));
    }
    return ok(validateRecord(record));
  }

  if (isJsonRecord(input.item)) {
    const record = input.item;
    if (isHookRecord(record)) {
      const { envelope } = normalizeHookSidecar(record);
      const result: JsonRecord = {};
      if (isJsonRecord(record.publisher_section)) {
        result.publisher_section = record.publisher_section;
        result.metadata_hash = computeMetadataHash(record.publisher_section).value;
        if (Object.hasOwn(record.publisher_section, "version")) {
          result.publisher_section_version = record.publisher_section.version;
        }
      }
      Object.assign(result, validateRecord(envelope));
      return ok(result);
    }
    return ok(observeItem(record));
  }

  if (isJsonRecord(input.publisher_section)) {
    return ok(metadataResult(input.publisher_section));
  }

  if (Object.hasOwn(input, "sidecar")) {
    return ingestSidecar(input);
  }

  if (typeof input.body_root === "string" && typeof input.entry_file === "string") {
    return ingestBodyRoot(input);
  }

  return unsupported();
}

async function ingestBodyRoot(input: JsonRecord): Promise<AdapterResponse> {
  if (typeof input.kind !== "string" || !FRONTMATTER_KINDS.has(input.kind)) {
    return unsupported();
  }

  try {
    const body = await ingestDirectory(input.body_root as string);
    const bodyHash = computeFrontmatterBodyHash({
      files: body.files,
      symlinks: body.symlinks,
      entryFile: input.entry_file as string,
    });
    const result: JsonRecord = {
      classification: bodyHash.classification,
      body_hash: bodyHash.value,
    };

    const frontmatter = frontmatterFromBody(body.files, input.entry_file as string);
    if (frontmatter === undefined) {
      result.publisher_declared = false;
      return ok(result);
    }

    result.publisher_declared = true;
    result.publisher_section = frontmatter;
    result.metadata_hash = computeMetadataHash(frontmatter).value;
    result.canonical_bytes = metadataHashCanonicalJson(frontmatter);
    return ok(result);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      return specError(error.id, error.params);
    }
    throw error;
  }
}

function isHookRecord(record: unknown): record is JsonRecord {
  if (!isJsonRecord(record)) {
    return false;
  }
  const envelopeKind = selectedEnvelopeRecord(record)?.kind;
  if (envelopeKind === "hook") {
    return true;
  }
  if (Object.hasOwn(record, "hook")) {
    return true;
  }
  if (Object.hasOwn(record, "event") && Object.hasOwn(record, "handlers")) {
    return true;
  }
  return false;
}

function normalizeHookSidecar(sidecar: JsonRecord): { isBare: boolean; envelope: JsonRecord; hookBlock: JsonRecord } {
  if (Object.hasOwn(sidecar, "hook")) {
    return {
      isBare: false,
      envelope: sidecar,
      hookBlock: isJsonRecord(sidecar.hook) ? sidecar.hook : {},
    };
  } else {
    const syntheticEnvelope = {
      kind: "hook",
      id: "00000000-0000-4000-8000-000000000000",
      display_name: "Bare Hook",
      version: "0.1.0",
      hook: sidecar,
    };
    return {
      isBare: true,
      envelope: syntheticEnvelope,
      hookBlock: sidecar,
    };
  }
}

async function ingestSidecar(input: JsonRecord): Promise<AdapterResponse> {
  if (!isJsonRecord(input.sidecar)) {
    return unsupported();
  }

  const kind = typeof input.kind === "string" ? input.kind : typeof input.sidecar.kind === "string" ? input.sidecar.kind : undefined;
  if (kind === undefined) {
    return unsupported();
  }

  if (kind === "hook") {
    const { isBare, envelope, hookBlock } = normalizeHookSidecar(input.sidecar);

    const validation = validateRecord(envelope);
    if (validation.conformant === false) {
      const result: JsonRecord = {
        ...validation,
        canonical: hookBlock,
        canonical_bytes: canonicalJson(hookBlock),
      };
      return ok(result);
    }

    const canonicalHookResult = canonicalizeHookWithPlatform(hookBlock);

    const result: JsonRecord = { conformant: true };
    const resolution = resolvePackMembership(envelope);
    if (resolution.install === "proceed" && resolution.packResolution === undefined) {
      result.installable = true;
    }

    result.canonical = canonicalHookResult.hook;
    result.canonical_bytes = canonicalJson(canonicalHookResult.hook);

    if (!isBare) {
      const publisherSection = publisherSectionFromSidecar(kind, envelope);
      if (publisherSection !== undefined) {
        Object.assign(result, metadataResult(publisherSection));
      }
    }

    if (typeof input.body_root === "string") {
      const body = await ingestDirectory(input.body_root);
      result.body_hash = computeHookBodyHash(canonicalHookResult.hook, {
        files: body.files,
        symlinks: body.symlinks,
      }).value;
    } else {
      const referencedPaths = getReferencedFilePaths(canonicalHookResult.hook);
      if (referencedPaths.length === 0) {
        result.body_hash = computeHookBodyHash(canonicalHookResult.hook, {
          files: {},
        }).value;
      }
    }

    if (canonicalHookResult.diagnostics.length > 0) {
      result.diagnostics = canonicalHookResult.diagnostics;
    }

    return ok(result);
  }

  try {
    const result: JsonRecord = { canonical: input.sidecar };
    Object.assign(result, validateRecord(input.sidecar));

    const publisherSection = publisherSectionFromSidecar(kind, input.sidecar);
    if (publisherSection !== undefined) {
      Object.assign(result, metadataResult(publisherSection));
    }

    if (kind === "mcp_config" && Object.hasOwn(input.sidecar, "mcp")) {
      result.body_hash = computeMcpBodyHash(input.sidecar.mcp).value;
    }

    return ok(result);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      return specError(error.id, error.params);
    }
    throw error;
  }
}

function ingestPackManifests(input: JsonRecord): AdapterResponse {
  if (!Array.isArray(input.manifests)) {
    return unsupported();
  }

  const repositoryUrl = typeof input.repository_url === "string" ? input.repository_url : "https://example.invalid/owner/repository";
  const inference = inferPackId({
    repositoryUrl,
    manifests: input.manifests.map((entry) =>
      isJsonRecord(entry)
        ? {
            source: typeof entry.source === "string" ? entry.source : "",
            manifest: entry.manifest,
            name: entry.name,
          }
        : { source: "", manifest: entry },
    ),
  });

  if (inference.canonicalSource === "directory-adjacency" && typeof input.repository_url !== "string") {
    return unsupported();
  }

  return ok({
    canonical_source: inference.canonicalSource,
    canonical_display_name: inference.canonicalDisplayName,
    diagnostics: inference.diagnostics.map((diagnostic) => ({
      id: diagnostic.id,
      params: {
        sources: diagnostic.params.names_sources,
        values: diagnostic.params.names_values,
        names_sources: diagnostic.params.names_sources,
        names_values: diagnostic.params.names_values,
      },
    })),
  });
}

function derivePackId(input: JsonRecord): AdapterResponse {
  const namespace = input.namespace;
  const repositoryUrl = stringInput(input.repository_url) ?? stringInput(input.canonical_repository_url);
  const displayName = stringInput(input.display_name) ?? stringInput(input.canonical_display_name);

  if (namespace !== ACIF_PACK_NAMESPACE || repositoryUrl === undefined || displayName === undefined) {
    return unsupported();
  }

  const canonicalRepositoryUrl = Object.hasOwn(input, "canonical_repository_url")
    ? repositoryUrl
    : canonicalizeRepositoryUrlForPackInference(repositoryUrl);

  return ok({
    inferred_pack_id: deriveInferredPackId(canonicalRepositoryUrl, displayName),
    canonical_repository_url: canonicalRepositoryUrl,
  });
}

function resolvePack(input: JsonRecord): AdapterResponse {
  if (!Object.hasOwn(input, "item")) {
    return unsupported();
  }

  const knownPacks = Array.isArray(input.known_packs) ? input.known_packs : undefined;
  const resolution = resolvePackMembership(input.item, knownPacks);
  const result: JsonRecord = {
    pack_resolution: resolution.packResolution ?? "none",
    install: resolution.install,
  };

  if (resolution.memberOf !== undefined) {
    result.member_of = resolution.memberOf;
  }

  return ok(result);
}

function evaluateRequires(input: JsonRecord): AdapterResponse {
  if (!Object.hasOwn(input, "item_requires")) {
    return unsupported();
  }
  if (!Array.isArray(input.consumer_recognizes)) {
    return unsupported();
  }

  const consumerRecognizes = new Set(input.consumer_recognizes.filter((key): key is string => typeof key === "string"));
  const evaluation = evaluateRequiresSlot(input.item_requires, (key) =>
    consumerRecognizes.has(key) ? "satisfied" : undefined,
  );
  const install = decideRequiresInstall(evaluation);

  return ok({
    evaluation: evaluation.overall,
    install: install.decision === "proceed" ? "proceed" : "refuse-unless-operator-opt-in",
    keys: evaluation.keys,
    satisfied_keys: evaluation.satisfiedKeys,
    unsatisfied_keys: evaluation.unsatisfiedKeys,
    unknown_keys: evaluation.unknownKeys,
  });
}

function observeItem(item: JsonRecord): JsonRecord {
  const result: JsonRecord = {};

  if (isJsonRecord(item.publisher_section)) {
    result.publisher_section = item.publisher_section;
    result.metadata_hash = computeMetadataHash(item.publisher_section).value;
    if (Object.hasOwn(item.publisher_section, "version")) {
      result.publisher_section_version = item.publisher_section.version;
    }
  }

  if (isCompleteEnoughForRecordValidation(item)) {
    Object.assign(result, validateRecord(item));
  }

  const resolution = resolvePackMembership(item);
  if (resolution.install === "proceed" && resolution.packResolution === undefined) {
    result.installable = true;
  }

  return result;
}

async function ingestProviderConfig(input: JsonRecord): Promise<AdapterResponse> {
  const context = isJsonRecord(input.context) ? input.context : undefined;
  const eventName = typeof context?.event === "string" ? context.event : undefined;
  const config = input.provider_config as any;

  let content = config.content;
  if (content === undefined || content === null) {
    if (typeof input.body_root === "string" && typeof config.path === "string") {
      const body = await ingestDirectory(input.body_root);
      const configPath = config.path;
      const fileEntry = body.files.find((f) => f.path === configPath);
      if (fileEntry !== undefined) {
        if (fileEntry.content instanceof Uint8Array) {
          content = new TextDecoder().decode(fileEntry.content);
        } else {
          content = fileEntry.content;
        }
      }
    }
  }

  const resolvedConfig = {
    ...config,
    content,
  };

  try {
    const canonicalResult = canonicalizeProviderPlatform(resolvedConfig, eventName);
    const rollupProvenance = determineProvenanceRollup(canonicalResult.hook, canonicalResult.provenance);

    const result: JsonRecord = {
      canonical: canonicalResult.hook,
      canonical_bytes: canonicalJson(canonicalResult.hook),
      provenance: rollupProvenance,
    };

    if (typeof input.body_root === "string") {
      const body = await ingestDirectory(input.body_root);
      result.body_hash = computeHookBodyHash(canonicalResult.hook, {
        files: body.files,
        symlinks: body.symlinks,
      }).value;
    } else {
      const referencedPaths = getReferencedFilePaths(canonicalResult.hook);
      if (referencedPaths.length === 0) {
        result.body_hash = computeHookBodyHash(canonicalResult.hook, {
          files: {},
        }).value;
      }
    }

    if (canonicalResult.diagnostics.length > 0) {
      result.diagnostics = canonicalResult.diagnostics;
    }

    return ok(result);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      return specError(error.id, error.params);
    }
    throw error;
  }
}

function project(input: JsonRecord): AdapterResponse {
  const item = input.item;
  if (!item) {
    return unsupported();
  }
  const projectionName = input.projection;
  if (typeof projectionName !== "string") {
    return unsupported();
  }

  const hook = isJsonRecord(item) && item.hook !== undefined ? item.hook : (isJsonRecord(item) && item.kind === "hook" ? item.hook : item);
  if (!hook) {
    return unsupported();
  }

  if (projectionName === "os_coverage") {
    const projectionValue = projectOsCoverage(hook, item);
    return ok({
      projection: projectionValue,
    });
  }

  if (projectionName === "derived_capabilities") {
    const projectionValue = projectDerivedCapabilities(hook);
    return ok({
      derived_capabilities: projectionValue,
    });
  }

  if (projectionName === "script_selection") {
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const selection: Record<string, string | "none"> = {};
    const diagnostics: any[] = [];

    const handler = isJsonRecord(hook) && Array.isArray(hook.handlers)
      ? hook.handlers.find((h: any) => h.type === "command")
      : undefined;
    const scripts = handler?.scripts || [];

    for (const target of targets) {
      try {
        const res = selectScript(scripts, target);
        if (res.selected) {
          selection[target] = (res.selected as any).path || "none";
        } else {
          selection[target] = "none";
        }
        if (res.diagnostics.length > 0) {
          diagnostics.push(...res.diagnostics);
        }
      } catch (error) {
        selection[target] = "none";
        diagnostics.push({
          id: "acif.hook.script_no_platform_match",
          message: `No script entry matches the target OS '${target}'.`,
          params: { os: target },
        });
      }
    }

    return ok({
      selection,
      diagnostics,
    });
  }

  return unsupported();
}

function render(input: JsonRecord): AdapterResponse {
  const canonical = input.canonical;
  const target = input.target;
  if (!canonical || typeof target !== "string") {
    return unsupported();
  }

  const invocation = isJsonRecord(input.invocation) ? input.invocation : undefined;
  const targetOs = typeof invocation?.target_os === "string" ? invocation.target_os : undefined;

  const hook = isJsonRecord(canonical) && canonical.hook !== undefined ? canonical.hook : (isJsonRecord(canonical) && canonical.kind === "hook" ? canonical.hook : canonical);
  if (!hook) {
    return unsupported();
  }

  try {
    const renderResult = renderHookBlock(hook, target, targetOs);
    const result: JsonRecord = {
      output: renderResult.output,
      lossy: [],
    };
    if (renderResult.diagnostics.length > 0) {
      result.diagnostics = renderResult.diagnostics;
    }
    return ok(result);
  } catch (error) {
    if (error instanceof AcifBodyHashError) {
      return specError(error.id, error.params);
    }
    throw error;
  }
}

function evaluateInstall(input: JsonRecord): AdapterResponse {
  const item = input.item;
  if (!item) {
    return unsupported();
  }

  const targetOs = typeof input.install_target_os === "string" ? input.install_target_os : undefined;
  const evaluation = evaluateHookInstall(item, targetOs);

  return ok({
    install: evaluation.install,
    diagnostics: evaluation.diagnostics,
  });
}

function validateRecord(record: unknown): JsonRecord {
  const envelopeResult = validateEnvelope(record);
  if (!envelopeResult.ok) {
    const rejection = envelopeResult.rejections[0];
    return verdict(false, rejection.id, "params" in rejection ? rejection.params : undefined);
  }

  const requiresRejection = firstRequiresRejection(record);
  if (requiresRejection !== undefined) {
    return verdict(false, requiresRejection.id, requiresRejection.params);
  }

  const envelopeRecord = selectedEnvelopeRecord(record);
  const kind = envelopeRecord?.kind;
  if (kind === "hook" && envelopeRecord !== undefined) {
    const hookBlock = envelopeRecord.hook;
    if (hookBlock !== undefined) {
      canonicalizeHookWithPlatform(hookBlock);
    }
  }

  const result: JsonRecord = { conformant: true };
  const resolution = resolvePackMembership(record);
  if (resolution.install === "proceed") {
    result.installable = true;
  }
  return result;
}

function firstRequiresRejection(record: unknown): { readonly id: string; readonly params?: Readonly<Record<string, unknown>> } | undefined {
  const envelopeRecord = selectedEnvelopeRecord(record);
  const kind = envelopeRecord?.kind;
  if (envelopeRecord === undefined || !isRequiresContentType(kind)) {
    return undefined;
  }

  const extensionBlock = envelopeRecord[extensionBlockKey(kind)];
  const requires = isJsonRecord(extensionBlock) && Object.hasOwn(extensionBlock, "requires")
    ? extensionBlock.requires
    : undefined;
  const requiresResult = validateRequiresSlotForContentType(kind, requires);
  return requiresResult.rejections[0];
}

function metadataResult(publisherSection: JsonRecord): JsonRecord {
  return {
    publisher_section: publisherSection,
    canonical_bytes: metadataHashCanonicalJson(publisherSection),
    metadata_hash: computeMetadataHash(publisherSection).value,
  };
}

function frontmatterFromBody(
  files: readonly { readonly path: string; readonly content: string | Uint8Array }[],
  entryFile: string,
): JsonRecord | undefined {
  const entry = files.find((file) => file.path === entryFile);
  if (entry === undefined) {
    return undefined;
  }

  return parseFrontmatter(typeof entry.content === "string" ? entry.content : UTF8.decode(entry.content));
}

function parseFrontmatter(content: string): JsonRecord | undefined {
  const normalized = content.replace(/\r\n?/gu, "\n");
  if (!normalized.startsWith("---\n")) {
    return undefined;
  }

  const closeIndex = normalized.indexOf("\n---", "---\n".length);
  if (closeIndex === -1) {
    return undefined;
  }

  const afterClose = normalized.slice(closeIndex + "\n---".length);
  if (afterClose.length > 0 && !afterClose.startsWith("\n")) {
    return undefined;
  }

  const parsed = parseSimpleYamlMap(normalized.slice("---\n".length, closeIndex));
  return Object.keys(parsed).length === 0 ? undefined : parsed;
}

function parseSimpleYamlMap(source: string): JsonRecord {
  const result: JsonRecord = {};
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new Error(`frontmatter line is not a simple key/value pair: ${rawLine}`);
    }

    const key = line.slice(0, separator).trim();
    if (Object.hasOwn(result, key)) {
      throw new Error(`frontmatter repeats key: ${key}`);
    }

    result[key] = parseSimpleYamlScalar(line.slice(separator + 1).trim());
  }
  return result;
}

function parseSimpleYamlScalar(source: string): unknown {
  if (source.length === 0) {
    return "";
  }
  if (source === "true") {
    return true;
  }
  if (source === "false") {
    return false;
  }
  if (source === "null" || source === "~") {
    return null;
  }
  if (source.startsWith("[") && source.endsWith("]")) {
    return parseInlineArray(source);
  }
  if ((source.startsWith("\"") && source.endsWith("\"")) || (source.startsWith("'") && source.endsWith("'"))) {
    return source.slice(1, -1);
  }
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(source)) {
    return Number(source);
  }
  return source;
}

function parseInlineArray(source: string): unknown[] {
  const body = source.slice(1, -1).trim();
  if (body.length === 0) {
    return [];
  }
  return body.split(",").map((value) => parseSimpleYamlScalar(value.trim()));
}

function publisherSectionFromSidecar(kind: string, sidecar: JsonRecord): JsonRecord | undefined {
  if (isJsonRecord(sidecar.publisher_section)) {
    return sidecar.publisher_section;
  }

  if (SIDECAR_ONLY_KINDS.has(kind)) {
    const publisherSection: JsonRecord = {};
    for (const field of ENVELOPE_FIELDS) {
      if (Object.hasOwn(sidecar, field)) {
        publisherSection[field] = sidecar[field];
      }
    }
    return Object.keys(publisherSection).length === 0 ? undefined : publisherSection;
  }

  if (FRONTMATTER_KINDS.has(kind) || kind === "pack") {
    const publisherSection: JsonRecord = {};
    for (const [key, value] of Object.entries(sidecar)) {
      if (!PUBLISHER_SECTION_OMIT_FIELDS.has(key)) {
        publisherSection[key] = value;
      }
    }
    return Object.keys(publisherSection).length === 0 ? undefined : publisherSection;
  }

  return undefined;
}

function selectedEnvelopeRecord(record: unknown): JsonRecord | undefined {
  if (!isJsonRecord(record)) {
    return undefined;
  }
  return isJsonRecord(record.publisher_section) ? record.publisher_section : record;
}

function isCompleteEnoughForRecordValidation(record: JsonRecord): boolean {
  const envelopeRecord = selectedEnvelopeRecord(record);
  return typeof envelopeRecord?.kind === "string" && Object.hasOwn(envelopeRecord, "id");
}

function extensionBlockKey(kind: AcifRequiresContentType): string {
  return kind === "mcp_config" ? "mcp" : kind;
}

function isRequiresContentType(value: unknown): value is AcifRequiresContentType {
  return typeof value === "string" && REQUIRES_CONTENT_TYPE_SET.has(value);
}

function verdict(conformant: boolean, reason?: string, params?: Readonly<Record<string, unknown>>): JsonRecord {
  if (conformant) {
    return { conformant: true };
  }

  const result: JsonRecord = { conformant: false, reason };
  if (params !== undefined) {
    result.params = params;
  }
  return result;
}

function ok(result: JsonRecord): AdapterResponse {
  return { ok: true, result };
}

function specError(errorId: string, params?: any): AdapterResponse {
  return {
    ok: false,
    error: errorId,
    diagnostics: [
      {
        id: errorId,
        params: params ?? {},
      },
    ],
  };
}

function adapterError(detail: string): AdapterResponse {
  return { ok: false, error: `adapter: ${detail}`, diagnostics: [] };
}

function unsupported(): AdapterResponse {
  return { unsupported: true };
}

function requireJsonRecord(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new Error(`malformed request: ${label} must be an object`);
  }
  return value;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringInput(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function packageVersion(): Promise<string> {
  packageVersionPromise ??= readPackageVersion();
  return packageVersionPromise;
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(new TextDecoder().decode(await readFile(PACKAGE_JSON_PATH))) as unknown;
  if (!isJsonRecord(packageJson) || typeof packageJson.version !== "string") {
    throw new Error("package.json version must be a string");
  }
  return packageJson.version;
}

function stripTrailingCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function writeStdoutJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
