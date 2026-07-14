export const ACIF_ENVELOPE_KINDS = [
  "hook",
  "skill",
  "rule",
  "command",
  "agent",
  "mcp_config",
  "pack",
] as const;

export const ACIF_ENVELOPE_FORBIDDEN_FIELDS = [
  "effective_version",
  "derived_version",
  "pack_inherited_version",
  "resolved_version",
] as const;

export type AcifEnvelopeKind = (typeof ACIF_ENVELOPE_KINDS)[number];
export type AcifEnvelopeForbiddenField = (typeof ACIF_ENVELOPE_FORBIDDEN_FIELDS)[number];

export type AcifEnvelopeRejectionId =
  | "acif.envelope.kind_invalid"
  | "acif.envelope.id_invalid"
  | "acif.envelope.version_invalid"
  | "acif.envelope.license_spdx_invalid"
  | "acif.envelope.forbidden_field";

export type AcifEnvelopeRejection =
  | {
      readonly id: Exclude<AcifEnvelopeRejectionId, "acif.envelope.forbidden_field">;
      readonly code: Exclude<AcifEnvelopeRejectionId, "acif.envelope.forbidden_field">;
    }
  | {
      readonly id: "acif.envelope.forbidden_field";
      readonly code: "acif.envelope.forbidden_field";
      readonly params: Readonly<{ field: AcifEnvelopeForbiddenField }>;
    };

export interface AcifEnvelopeLicense {
  spdx?: string;
  file?: unknown;
  url?: unknown;
}

export interface AcifEnvelope {
  kind: AcifEnvelopeKind;
  id: string;
  display_name?: unknown;
  version?: string;
  description?: unknown;
  license?: AcifEnvelopeLicense;
  pack_id?: unknown;
}

export type AcifEnvelopeValidationResult =
  | { readonly ok: true; readonly envelope: AcifEnvelope; readonly rejections: readonly [] }
  | { readonly ok: false; readonly rejections: readonly AcifEnvelopeRejection[] };

type JsonRecord = Record<string, unknown>;

const ENVELOPE_KIND_SET = new Set<string>(ACIF_ENVELOPE_KINDS);

const UUID_V4_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const UUID_V5_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-5[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SPDX_LICENSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export function validateEnvelope(input: unknown): AcifEnvelopeValidationResult {
  const rejections: AcifEnvelopeRejection[] = [];
  const root = isJsonRecord(input) ? input : undefined;
  const envelopeRecord = selectEnvelopeRecord(root);

  collectForbiddenFieldRejections(root, rejections);
  validateEnvelopeFields(envelopeRecord, rejections);

  if (rejections.length > 0) {
    return { ok: false, rejections };
  }

  return {
    ok: true,
    envelope: buildEnvelope(envelopeRecord),
    rejections: [],
  };
}

export function isAcifEnvelopeKind(value: unknown): value is AcifEnvelopeKind {
  return typeof value === "string" && ENVELOPE_KIND_SET.has(value);
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isUuidV5(value: unknown): value is string {
  return typeof value === "string" && UUID_V5_PATTERN.test(value);
}

export function isSemVer(value: unknown): value is string {
  return typeof value === "string" && SEMVER_PATTERN.test(value);
}

export function isSpdxLicenseIdentifier(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  if (!SPDX_LICENSE_ID_PATTERN.test(value)) {
    return false;
  }
  if (value.startsWith("LicenseRef-") || value.startsWith("DocumentRef-")) {
    return false;
  }
  return true;
}

function validateEnvelopeFields(record: JsonRecord | undefined, rejections: AcifEnvelopeRejection[]): void {
  if (!isAcifEnvelopeKind(record?.kind)) {
    rejections.push(rejection("acif.envelope.kind_invalid"));
  }

  const inferredPack = isInferredPackRecord(record);
  const validId = inferredPack ? isUuidV5(record?.id) : isUuidV4(record?.id);
  if (!validId) {
    rejections.push(rejection("acif.envelope.id_invalid"));
  }

  if (record !== undefined && Object.hasOwn(record, "version") && !isSemVer(record.version)) {
    rejections.push(rejection("acif.envelope.version_invalid"));
  }

  const license = record?.license;
  if (isJsonRecord(license) && Object.hasOwn(license, "spdx") && !isSpdxLicenseIdentifier(license.spdx)) {
    rejections.push(rejection("acif.envelope.license_spdx_invalid"));
  }
}

function selectEnvelopeRecord(root: JsonRecord | undefined): JsonRecord | undefined {
  if (root === undefined) {
    return undefined;
  }
  if (isJsonRecord(root.publisher_section)) {
    return root.publisher_section;
  }
  return root;
}

function collectForbiddenFieldRejections(
  root: JsonRecord | undefined,
  rejections: AcifEnvelopeRejection[],
): void {
  if (root === undefined) {
    return;
  }

  collectForbiddenFieldsFromRecord(root, rejections);
  if (isJsonRecord(root.publisher_section)) {
    collectForbiddenFieldsFromRecord(root.publisher_section, rejections);
  }
  if (isJsonRecord(root.registry_section)) {
    collectForbiddenFieldsFromRecord(root.registry_section, rejections);
  }
}

function collectForbiddenFieldsFromRecord(record: JsonRecord, rejections: AcifEnvelopeRejection[]): void {
  for (const field of ACIF_ENVELOPE_FORBIDDEN_FIELDS) {
    if (Object.hasOwn(record, field)) {
      rejections.push({
        id: "acif.envelope.forbidden_field",
        code: "acif.envelope.forbidden_field",
        params: { field },
      });
    }
  }
}

function buildEnvelope(record: JsonRecord | undefined): AcifEnvelope {
  if (record === undefined || !isAcifEnvelopeKind(record.kind) || typeof record.id !== "string") {
    throw new Error("Cannot build envelope from an invalid record");
  }

  const envelope: AcifEnvelope = {
    kind: record.kind,
    id: record.id,
  };

  copyIfPresent(record, envelope, "display_name");
  copyIfPresent(record, envelope, "description");
  copyIfPresent(record, envelope, "pack_id");

  if (typeof record.version === "string") {
    envelope.version = record.version;
  }

  if (isJsonRecord(record.license)) {
    const license: AcifEnvelopeLicense = {};
    if (typeof record.license.spdx === "string") {
      license.spdx = record.license.spdx;
    }
    if (Object.hasOwn(record.license, "file")) {
      license.file = record.license.file;
    }
    if (Object.hasOwn(record.license, "url")) {
      license.url = record.license.url;
    }
    envelope.license = license;
  }

  return envelope;
}

function copyIfPresent<Key extends keyof AcifEnvelope>(
  source: JsonRecord,
  target: AcifEnvelope,
  key: Key,
): void {
  if (Object.hasOwn(source, key)) {
    target[key] = source[key] as AcifEnvelope[Key];
  }
}

function isInferredPackRecord(record: JsonRecord | undefined): boolean {
  return record?.kind === "pack" && isJsonRecord(record.pack) && record.pack.source_kind === "inferred";
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejection(id: Exclude<AcifEnvelopeRejectionId, "acif.envelope.forbidden_field">): AcifEnvelopeRejection {
  return { id, code: id };
}
