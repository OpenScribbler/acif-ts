import { canonicalJson, canonicalJsonBytes } from "./canonical";
import { sha256Hex } from "./body_hash";

export const METADATA_HASH_ALGORITHM = "sha256" as const;

export type MetadataHashAlgorithm = typeof METADATA_HASH_ALGORITHM;
export type MetadataHashRequirement = "required" | "absent";

export interface MetadataHash {
  algorithm: MetadataHashAlgorithm;
  value: string;
}

export interface MetadataHashPresenceCheck {
  requirement: MetadataHashRequirement;
  present: boolean;
  ok: boolean;
}

type JsonRecord = Record<string, unknown>;

export function computeMetadataHash(publisherSection: unknown): MetadataHash {
  return {
    algorithm: METADATA_HASH_ALGORITHM,
    value: sha256Hex(metadataHashPreimageBytes(publisherSection)),
  };
}

export const metadataHash = computeMetadataHash;

export function metadataHashCanonicalJson(publisherSection: unknown): string {
  assertPublisherSectionObject(publisherSection);
  return canonicalJson(publisherSection);
}

export function metadataHashPreimageBytes(publisherSection: unknown): Uint8Array {
  assertPublisherSectionObject(publisherSection);
  return appendLineFeed(canonicalJsonBytes(publisherSection));
}

export function metadataHashRequiredForRecord(record: unknown): boolean {
  return metadataHashRequirementForRecord(record) === "required";
}

export function metadataHashRequirementForRecord(record: unknown): MetadataHashRequirement {
  if (!isJsonRecord(record)) {
    return "absent";
  }

  if (Object.hasOwn(record, "publisher_section")) {
    return "required";
  }

  if (isPackSection(record)) {
    return record.pack.source_kind === "declared" ? "required" : "absent";
  }

  if (typeof record.kind === "string" && !Object.hasOwn(record, "registry_section")) {
    return "required";
  }

  return "absent";
}

export function checkMetadataHashPresence(record: unknown): MetadataHashPresenceCheck {
  const requirement = metadataHashRequirementForRecord(record);
  const present = hasMetadataHash(record);

  return {
    requirement,
    present,
    ok: requirement === "required" ? present : !present,
  };
}

export function hasMetadataHash(record: unknown): boolean {
  if (!isJsonRecord(record)) {
    return false;
  }

  if (Object.hasOwn(record, "metadata_hash")) {
    return true;
  }

  return isJsonRecord(record.registry_section) && Object.hasOwn(record.registry_section, "metadata_hash");
}

function assertPublisherSectionObject(value: unknown): asserts value is JsonRecord {
  if (!isJsonRecord(value)) {
    throw new TypeError("publisher_section must be a parsed JSON object");
  }
}

function appendLineFeed(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.length + 1);
  output.set(bytes);
  output[bytes.length] = 0x0a;
  return output;
}

function isPackSection(record: JsonRecord): record is JsonRecord & {
  kind: "pack";
  pack: { source_kind: "declared" | "inferred" };
} {
  return (
    record.kind === "pack" &&
    isJsonRecord(record.pack) &&
    (record.pack.source_kind === "declared" || record.pack.source_kind === "inferred")
  );
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
