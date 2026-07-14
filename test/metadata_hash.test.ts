import { describe, expect, it } from "vitest";

import {
  checkMetadataHashPresence,
  computeMetadataHash,
  hasMetadataHash,
  metadataHashCanonicalJson,
  metadataHashPreimageBytes,
  metadataHashRequiredForRecord,
} from "../src/metadata_hash";

const VALID_UUID_V4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const PACK_UUID = "11111111-1111-4111-8111-111111111111";

function metadataHashValue(publisherSection: unknown): string {
  return computeMetadataHash(publisherSection).value;
}

describe("metadata_hash vectors with pinned values", () => {
  it("TV-2 keeps metadata_hash invariant across inferred pack contexts", () => {
    const input = {
      publisher_section: {
        kind: "skill",
        id: VALID_UUID_V4,
        display_name: "Demo Skill",
      },
      contexts: [
        { inferred_pack_id: "33333333-3333-5333-8333-333333333333" },
        { inferred_pack_id: "44444444-4444-5444-8444-444444444444" },
      ],
    };

    const hashes = input.contexts.map(() => computeMetadataHash(input.publisher_section));

    expect(new Set(hashes.map((hash) => hash.value)).size).toBe(1);
    expect(hashes[0]).toEqual({
      algorithm: "sha256",
      value: "b68bf2e4cbd6b9123d23de684498157adeaf4915e65435a95a556ac27ec50316",
    });
  });

  it("TV-9 hashes JCS(publisher_section) followed by one LF", () => {
    const publisherSection = {
      kind: "command",
      id: VALID_UUID_V4,
      display_name: "Review PR",
      version: "1.2.0",
    };
    const canonicalBytes =
      '{"display_name":"Review PR","id":"f47ac10b-58cc-4372-a567-0e02b2c3d479","kind":"command","version":"1.2.0"}';

    expect(metadataHashCanonicalJson(publisherSection)).toBe(canonicalBytes);
    expect(new TextDecoder().decode(metadataHashPreimageBytes(publisherSection))).toBe(`${canonicalBytes}\n`);
    expect(computeMetadataHash(publisherSection)).toEqual({
      algorithm: "sha256",
      value: "ceb0cf9212c530e85444020aeb3cbae8865fdc16d91ee63fe6f5cb374d67b5c6",
    });
  });
});

describe("metadata_hash presence vectors", () => {
  it("TV-L2-a follows publisher_section declaration presence", () => {
    const undeclaredRecord = {
      registry_section: { publisher_declared: false },
    };
    const declaredRecord = {
      publisher_section: { display_name: "Demo" },
      registry_section: {
        publisher_declared: true,
        metadata_hash: computeMetadataHash({ display_name: "Demo" }),
      },
    };

    expect(checkMetadataHashPresence(undeclaredRecord)).toEqual({
      requirement: "absent",
      present: false,
      ok: true,
    });
    expect(checkMetadataHashPresence(declaredRecord)).toEqual({
      requirement: "required",
      present: true,
      ok: true,
    });
  });

  it("TV-L2-e requires metadata_hash for declared packs and forbids it for inferred packs", () => {
    const declaredPack = {
      kind: "pack",
      pack: { source_kind: "declared" },
      metadata_hash: computeMetadataHash({
        kind: "pack",
        pack: { source_kind: "declared" },
      }),
    };
    const inferredPack = {
      kind: "pack",
      pack: { source_kind: "inferred" },
    };

    expect(checkMetadataHashPresence(declaredPack)).toEqual({
      requirement: "required",
      present: true,
      ok: true,
    });
    expect(checkMetadataHashPresence(inferredPack)).toEqual({
      requirement: "absent",
      present: false,
      ok: true,
    });
    expect(checkMetadataHashPresence({ ...inferredPack, metadata_hash: declaredPack.metadata_hash }).ok).toBe(false);
  });

  it("TV-L3-a makes tuple metadata_hash present exactly when publisher_section is present", () => {
    const member1 = {
      item_id: "aaaa...",
      publisher_section: { kind: "skill", id: VALID_UUID_V4 },
      registry_section: { metadata_hash: computeMetadataHash({ kind: "skill", id: VALID_UUID_V4 }) },
    };
    const member2 = {
      item_id: "bbbb...",
      registry_section: {},
    };

    expect(metadataHashRequiredForRecord(member1)).toBe(true);
    expect(hasMetadataHash(member1)).toBe(true);
    expect(metadataHashRequiredForRecord(member2)).toBe(false);
    expect(hasMetadataHash(member2)).toBe(false);
  });
});

describe("metadata_hash boundary vectors", () => {
  it("TV-L2-b hashes only envelope fields for sidecar-only publisher_section", () => {
    const authoredSidecar = {
      kind: "hook",
      id: VALID_UUID_V4,
      display_name: "Guard Write",
      pack_id: PACK_UUID,
      hook: {
        event: "before_tool_execute",
        handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\nexit 0\n" }] }],
      },
    };
    const publisherSection = {
      kind: authoredSidecar.kind,
      id: authoredSidecar.id,
      display_name: authoredSidecar.display_name,
      pack_id: authoredSidecar.pack_id,
    };
    const edit = { display_name: "Guard Write v2" };

    expect(Object.keys(publisherSection)).toEqual(["kind", "id", "display_name", "pack_id"]);
    expect(publisherSection).not.toHaveProperty("hook");
    expect(metadataHashValue({ ...publisherSection, ...edit })).not.toBe(metadataHashValue(publisherSection));
  });

  it("TV-L2-c hashes faithful declared provider-native spellings, not translated canonical form", () => {
    const publisherSection = { kind: "agent", agent: { tools: ["Read", "Task"] } };
    const canonicalForm = { kind: "agent", agent: { tools: ["file_read", "agent"] } };

    expect(publisherSection.agent.tools).toEqual(["Read", "Task"]);
    expect(metadataHashValue(publisherSection)).not.toBe(metadataHashValue(canonicalForm));
  });

  it("TV-COMMAND-h moves metadata_hash for frontmatter model and allowed_tools edits", () => {
    const variant1 = { kind: "command", command: { model: "model-a", allowed_tools: ["Read"] } };
    const variant2 = { kind: "command", command: { model: "model-b", allowed_tools: ["Read", "Edit"] } };

    expect(metadataHashValue(variant2)).not.toBe(metadataHashValue(variant1));
  });

  it("TV-SKILL-h and TV-RULE-a keep materialized defaults out of metadata_hash", () => {
    const declaredSkill = { kind: "skill", display_name: "Demo" };
    const declaredRule = { kind: "rule" };

    expect(metadataHashValue(declaredSkill)).toBe(metadataHashValue({ kind: "skill", display_name: "Demo" }));
    expect(metadataHashValue(declaredRule)).toBe(metadataHashValue({ kind: "rule" }));
    expect(metadataHashValue({ ...declaredSkill, skill: { activation: { type: "auto", user_invocable: true } } })).not.toBe(
      metadataHashValue(declaredSkill),
    );
    expect(metadataHashValue({ ...declaredRule, rule: { activation: { mode: "always" } } })).not.toBe(
      metadataHashValue(declaredRule),
    );
  });

  it("TV-SKILL-k and TV-RULE-l move metadata_hash for declared activation retargets", () => {
    const skillBase = { kind: "skill", skill: { activation: { type: "auto", user_invocable: true } } };
    const skillEdit = { kind: "skill", skill: { activation: { type: "auto", user_invocable: false } } };
    const ruleBase = { kind: "rule", rule: { activation: { mode: "manual" } } };
    const ruleEdit = { kind: "rule", rule: { activation: { mode: "always" } } };

    expect(metadataHashValue(skillEdit)).not.toBe(metadataHashValue(skillBase));
    expect(metadataHashValue(ruleEdit)).not.toBe(metadataHashValue(ruleBase));
  });

  it("TV-AGENT-h and TV-AGENT-i hash declared tool spellings and model pins only", () => {
    const toolVariants = ["Agent", "task", "spawn_agent", "use_subagent", "Task"].map((tool) =>
      metadataHashValue({ kind: "agent", agent: { tools: [tool] } }),
    );
    const modelA = { kind: "agent", agent: { model: "model-a" } };
    const modelB = { kind: "agent", agent: { model: "model-b" } };

    expect(new Set(toolVariants).size).toBe(toolVariants.length);
    expect(metadataHashValue(modelB)).not.toBe(metadataHashValue(modelA));
    expect(metadataHashValue(modelA)).toBe(metadataHashValue({ kind: "agent", agent: { model: "model-a" } }));
  });

  it("TV-URI-s excludes source_uri from metadata_hash", () => {
    const publisherSection = { kind: "skill", id: VALID_UUID_V4 };
    const records = [
      { source_uri: "https://a.example.com/SKILL.md" },
      { source_uri: "https://mirror.example.org/SKILL.md" },
    ];

    expect(records).toHaveLength(2);
    expect(metadataHashValue(publisherSection)).toBe(metadataHashValue(publisherSection));
  });
});

describe("metadata_hash unit behavior", () => {
  it("requires a parsed publisher_section object", () => {
    expect(() => computeMetadataHash(null)).toThrow(/publisher_section/);
    expect(() => computeMetadataHash(["not", "an", "object"])).toThrow(/publisher_section/);
  });

  it("reports missing and forbidden metadata_hash without inventing a publisher error id", () => {
    expect(metadataHashRequiredForRecord({ kind: "skill", id: VALID_UUID_V4 })).toBe(true);
    expect(checkMetadataHashPresence({ publisher_section: { kind: "skill" } })).toEqual({
      requirement: "required",
      present: false,
      ok: false,
    });
    expect(checkMetadataHashPresence({ registry_section: { metadata_hash: computeMetadataHash({ kind: "skill" }) } })).toEqual({
      requirement: "absent",
      present: true,
      ok: false,
    });
  });
});
