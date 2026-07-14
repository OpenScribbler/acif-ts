import { describe, expect, it } from "vitest";

import {
  type AcifEnvelopeRejectionId,
  isSemVer,
  isSpdxLicenseIdentifier,
  isUuidV4,
  isUuidV5,
  validateEnvelope,
} from "../src/envelope";

const VALID_UUID_V4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const VALID_UUID_V5 = "d932cd6d-1c14-527d-b2e7-185c717b7a0d";

function rejectionIds(input: unknown): AcifEnvelopeRejectionId[] {
  const result = validateEnvelope(input);
  return result.rejections.map((rejection) => rejection.id);
}

function expectOnlyRejection(input: unknown, id: AcifEnvelopeRejectionId): void {
  const result = validateEnvelope(input);

  expect(result.ok).toBe(false);
  expect(result.rejections).toEqual([{ id, code: id }]);
}

describe("validateEnvelope conformance vectors", () => {
  it("TV-11 case_1 rejects kind not in the closed enum", () => {
    expectOnlyRejection(
      { kind: "Skill", id: VALID_UUID_V4, display_name: "Demo" },
      "acif.envelope.kind_invalid",
    );
  });

  it("TV-11 case_2 rejects id that is not UUIDv4", () => {
    expectOnlyRejection(
      { kind: "skill", id: "not-a-uuid", display_name: "Demo" },
      "acif.envelope.id_invalid",
    );
  });

  it("TV-11 case_3 rejects a declared version that is not SemVer", () => {
    expectOnlyRejection(
      { kind: "skill", id: VALID_UUID_V4, display_name: "Demo", version: "1.0" },
      "acif.envelope.version_invalid",
    );
  });

  it("TV-11 case_4 rejects a malformed license.spdx identifier", () => {
    expectOnlyRejection(
      { kind: "skill", id: VALID_UUID_V4, display_name: "Demo", license: { spdx: "MIT License" } },
      "acif.envelope.license_spdx_invalid",
    );
  });

  it("TV-6 reports forbidden_field with the asserted field param", () => {
    const result = validateEnvelope({ kind: "skill", effective_version: "3.0.0" });

    expect(result.ok).toBe(false);
    expect(result.rejections).toContainEqual({
      id: "acif.envelope.forbidden_field",
      code: "acif.envelope.forbidden_field",
      params: { field: "effective_version" },
    });
  });

  it("TV-8 accepts a sectioned pack-less item publisher_section envelope", () => {
    const result = validateEnvelope({
      publisher_section: { kind: "rule", id: VALID_UUID_V4, display_name: "Demo" },
      registry_section: {},
    });

    expect(result).toEqual({
      ok: true,
      envelope: { kind: "rule", id: VALID_UUID_V4, display_name: "Demo" },
      rejections: [],
    });
  });

  it("TV-9 accepts the publisher_section used for the metadata_hash byte vector", () => {
    const result = validateEnvelope({
      publisher_section: {
        kind: "command",
        id: VALID_UUID_V4,
        display_name: "Review PR",
        version: "1.2.0",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope).toEqual({
        kind: "command",
        id: VALID_UUID_V4,
        display_name: "Review PR",
        version: "1.2.0",
      });
    }
  });
});

describe("validateEnvelope unit coverage", () => {
  it("accepts all core envelope kind literals by exact byte comparison", () => {
    for (const kind of ["hook", "skill", "rule", "command", "agent", "mcp_config", "pack"] as const) {
      expect(
        validateEnvelope({
          kind,
          id: VALID_UUID_V4,
          display_name: "Demo",
        }).ok,
      ).toBe(true);
    }
  });

  it("applies the inferred-pack UUIDv5 exception from the publisher pack shape", () => {
    expect(
      validateEnvelope({
        kind: "pack",
        id: VALID_UUID_V5,
        display_name: "superpowers",
        pack: { source_kind: "inferred" },
      }).ok,
    ).toBe(true);

    expectOnlyRejection(
      {
        kind: "pack",
        id: VALID_UUID_V5,
        display_name: "superpowers",
        pack: { source_kind: "declared" },
      },
      "acif.envelope.id_invalid",
    );
  });

  it("validates UUID version and RFC variant bits directly", () => {
    expect(isUuidV4(VALID_UUID_V4)).toBe(true);
    expect(isUuidV5(VALID_UUID_V5)).toBe(true);
    expect(isUuidV4(VALID_UUID_V5)).toBe(false);
    expect(isUuidV4("f47ac10b-58cc-4372-7567-0e02b2c3d479")).toBe(false);
  });

  it("validates Semantic Versioning 2.0.0 syntax directly", () => {
    expect(isSemVer("0.0.0")).toBe(true);
    expect(isSemVer("1.2.3-alpha.1+build.5")).toBe(true);
    expect(isSemVer("01.2.3")).toBe(false);
    expect(isSemVer("1.2.3-01")).toBe(false);
    expect(isSemVer("1.2")).toBe(false);
  });

  it("validates malformed license.spdx values without accepting expressions or custom refs", () => {
    expect(isSpdxLicenseIdentifier("MIT")).toBe(true);
    expect(isSpdxLicenseIdentifier("Apache-2.0")).toBe(true);
    expect(isSpdxLicenseIdentifier("MIT OR Apache-2.0")).toBe(false);
    expect(isSpdxLicenseIdentifier("LicenseRef-Proprietary")).toBe(false);
    expect(isSpdxLicenseIdentifier("MIT License")).toBe(false);
  });

  it("collects forbidden fields from the root record and both published-record sections", () => {
    const result = validateEnvelope({
      effective_version: "3.0.0",
      publisher_section: {
        kind: "skill",
        id: VALID_UUID_V4,
        display_name: "Demo",
        derived_version: "1.0.0",
      },
      registry_section: {
        resolved_version: "1.0.0",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.rejections).toEqual([
      {
        id: "acif.envelope.forbidden_field",
        code: "acif.envelope.forbidden_field",
        params: { field: "effective_version" },
      },
      {
        id: "acif.envelope.forbidden_field",
        code: "acif.envelope.forbidden_field",
        params: { field: "derived_version" },
      },
      {
        id: "acif.envelope.forbidden_field",
        code: "acif.envelope.forbidden_field",
        params: { field: "resolved_version" },
      },
    ]);
  });

  it("collects all envelope-layer rejections instead of stopping at the first", () => {
    expect(rejectionIds({
      kind: "Skill",
      id: "not-a-uuid",
      version: "1.0",
      license: { spdx: "MIT License" },
      effective_version: "3.0.0",
    })).toEqual([
      "acif.envelope.forbidden_field",
      "acif.envelope.kind_invalid",
      "acif.envelope.id_invalid",
      "acif.envelope.version_invalid",
      "acif.envelope.license_spdx_invalid",
    ]);
  });

  it("reports required kind and id malformations for non-record input", () => {
    expect(rejectionIds(null)).toEqual(["acif.envelope.kind_invalid", "acif.envelope.id_invalid"]);
  });
});
