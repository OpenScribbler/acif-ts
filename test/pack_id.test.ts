import { describe, expect, it } from "vitest";

import {
  ACIF_PACK_NAMESPACE,
  ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID,
  PACK_INFERENCE_VERSION,
  buildInferredPackRecord,
  canonicalAddressForPackInference,
  canonicalizeRepositoryUrlForPackInference,
  deriveInferredPackId,
  inferPackId,
  isPackMember,
  resolvePackMembership,
} from "../src/pack_id";

const DECLARED_PACK_ID = "11111111-1111-4111-8111-111111111111";
const INFERRED_PACK_ID = "22222222-2222-5222-8222-222222222222";
const UNRESOLVED_PACK_ID = "99999999-9999-4999-8999-999999999999";

describe("pack_id conformance vectors", () => {
  it("TV-3 derives inferred_pack_id deterministically under the pinned namespace", () => {
    const input = {
      namespace: "93516344-00e5-419b-a230-6e8b1d02f87d",
      canonical_repository_url: "https://github.com/obra/superpowers",
      canonical_display_name: "superpowers",
    };

    expect(ACIF_PACK_NAMESPACE).toBe(input.namespace);
    expect(deriveInferredPackId(input.canonical_repository_url, input.canonical_display_name)).toBe(
      "d932cd6d-1c14-527d-b2e7-185c717b7a0d",
    );

    const record = buildInferredPackRecord({
      repositoryUrl: input.canonical_repository_url,
      manifests: [{ source: "package.json", name: input.canonical_display_name }],
    });
    expect(record.record).toEqual({
      kind: "pack",
      id: "d932cd6d-1c14-527d-b2e7-185c717b7a0d",
      display_name: "superpowers",
      repository_url: "https://github.com/obra/superpowers",
      pack: {
        source_kind: "inferred",
        canonical_address: "obra/superpowers",
        inference_version: "v0.1",
      },
    });
  });

  it("TV-4 resolves declared pack membership before inferred membership", () => {
    const item = {
      publisher_section: { pack_id: DECLARED_PACK_ID },
      registry_section: { inferred_pack_id: INFERRED_PACK_ID },
    };

    expect(isPackMember(item, DECLARED_PACK_ID)).toBe(true);
    expect(isPackMember(item, INFERRED_PACK_ID)).toBe(false);
    expect(resolvePackMembership(item, [DECLARED_PACK_ID, INFERRED_PACK_ID])).toEqual({
      memberOf: DECLARED_PACK_ID,
      packResolution: "declared",
      install: "proceed",
    });
  });

  it("TV-5 marks a declared pack_id naming no known pack as unresolved", () => {
    const input = {
      item: {
        publisher_section: { pack_id: UNRESOLVED_PACK_ID },
      },
      known_packs: [],
    };

    expect(resolvePackMembership(input.item, input.known_packs)).toEqual({
      memberOf: UNRESOLVED_PACK_ID,
      packResolution: "unresolved",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-8 treats a pack-less item as first-class and installable", () => {
    const item = {
      publisher_section: { kind: "rule", id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", display_name: "Demo" },
      registry_section: {},
    };

    expect(resolvePackMembership(item)).toEqual({ install: "proceed" });
    expect(isPackMember(item, DECLARED_PACK_ID)).toBe(false);
  });

  it("TV-10 preserves pack identity across display-name rename", () => {
    const input = {
      pack_before: { id: DECLARED_PACK_ID, display_name: "old-name" },
      pack_after: { id: DECLARED_PACK_ID, display_name: "new-name" },
      referencing_item: { publisher_section: { pack_id: DECLARED_PACK_ID } },
    };

    expect(input.pack_after.id).toBe(input.pack_before.id);
    expect(isPackMember(input.referencing_item, input.pack_after)).toBe(true);
    expect(resolvePackMembership(input.referencing_item, [input.pack_after])).toEqual({
      memberOf: DECLARED_PACK_ID,
      packResolution: "declared",
      install: "proceed",
    });
  });

  it("TV-L2-f adopts the precedence winner and emits pack-source conflict params", () => {
    const input = {
      manifests: [
        { source: "package.json", name: "superpowers" },
        { source: "gemini-extension.json", name: "super-powers" },
      ],
    };

    const inference = inferPackId({
      repositoryUrl: "https://github.com/obra/superpowers",
      manifests: input.manifests,
    });

    expect(inference.canonicalSource).toBe("package.json");
    expect(inference.canonicalDisplayName).toBe("superpowers");
    expect(inference.diagnostics).toEqual([
      {
        id: ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID,
        code: ACIF_PUBLISHER_PACK_SOURCE_CONFLICT_ID,
        params: {
          names_sources: ["package.json", "gemini-extension.json"],
          names_values: ["superpowers", "super-powers"],
        },
      },
    ]);
  });
});

describe("pack inference algorithm §9", () => {
  it("§9.1 uses the manifest precedence order before directory adjacency", () => {
    const cases = [
      {
        manifests: {
          "package.json": { name: "package-name" },
          ".claude-plugin/plugin.json": { name: "package-name" },
        },
        source: "package.json",
      },
      {
        manifests: {
          ".claude-plugin/plugin.json": { name: "claude-name" },
          ".cursor-plugin/plugin.json": { name: "claude-name" },
        },
        source: ".claude-plugin/plugin.json",
      },
      {
        manifests: {
          ".cursor-plugin/plugin.json": { name: "cursor-name" },
          ".codex-plugin/plugin.json": { name: "cursor-name" },
        },
        source: ".cursor-plugin/plugin.json",
      },
      {
        manifests: {
          ".codex-plugin/plugin.json": { name: "codex-name" },
          "gemini-extension.json": { name: "codex-name" },
        },
        source: ".codex-plugin/plugin.json",
      },
      {
        manifests: {
          "gemini-extension.json": { name: "gemini-name" },
        },
        source: "gemini-extension.json",
      },
    ] as const;

    for (const testCase of cases) {
      expect(
        inferPackId({
          repositoryUrl: "https://github.com/example/repo",
          manifests: testCase.manifests,
        }).canonicalSource,
      ).toBe(testCase.source);
    }

    expect(
      inferPackId({
        repositoryUrl: "https://github.com/example/repo.git",
        manifests: {},
      }),
    ).toMatchObject({
      canonicalSource: "directory-adjacency",
      canonicalDisplayName: "repo",
    });
  });

  it("§9.1 and §9.2 fall through when higher-precedence names are absent or empty", () => {
    const inference = inferPackId({
      repositoryUrl: "https://github.com/example/repo",
      manifests: [
        { source: "package.json", manifest: {} },
        { source: ".claude-plugin/plugin.json", name: " \t\n " },
        { source: ".cursor-plugin/plugin.json", name: " Cursor Pack " },
        { source: ".codex-plugin/plugin.json", name: "Codex Pack" },
      ],
    });

    expect(inference.canonicalSource).toBe(".cursor-plugin/plugin.json");
    expect(inference.canonicalDisplayName).toBe("Cursor Pack");
  });

  it("§9.2 trims only leading and trailing whitespace without folding case or internal spaces", () => {
    const inference = inferPackId({
      repositoryUrl: "https://github.com/example/repo",
      manifests: [{ source: "package.json", name: "  My  Pack\t" }],
    });

    expect(inference.canonicalDisplayName).toBe("My  Pack");
  });

  it("§9.3 rewrites scp-form repository URLs into https fetch URLs", () => {
    expect(canonicalizeRepositoryUrlForPackInference("git@github.com:Obra/SuperPowers.git")).toBe(
      "https://github.com/obra/superpowers",
    );
  });

  it("§9.3 replaces URL schemes, drops userinfo, strips trailing slash and .git suffix", () => {
    expect(canonicalizeRepositoryUrlForPackInference("ssh://git@GitHub.com/Obra/SuperPowers.git/")).toBe(
      "https://github.com/obra/superpowers",
    );
    expect(canonicalizeRepositoryUrlForPackInference("git://user:pass@GitLab.com/Group/Sub/Repo.git")).toBe(
      "https://gitlab.com/group/sub/repo",
    );
  });

  it("§9.3 lowercases the whole URL, including path, for pack inference only", () => {
    expect(canonicalizeRepositoryUrlForPackInference("http://Example.com/Owner/MixedCaseRepo")).toBe(
      "https://example.com/owner/mixedcaserepo",
    );
  });

  it("§9.5 extracts canonical-address owners for each host family", () => {
    expect(canonicalAddressForPackInference("https://github.com/owner/repo", "PackName")).toBe("owner/PackName");
    expect(canonicalAddressForPackInference("https://bitbucket.org/team/repo", "PackName")).toBe("team/PackName");
    expect(canonicalAddressForPackInference("https://gitlab.com/group/subgroup/repo", "PackName")).toBe(
      "group/subgroup/PackName",
    );
    expect(canonicalAddressForPackInference("https://git.sr.ht/~alice/repo", "PackName")).toBe("alice/PackName");
    expect(canonicalAddressForPackInference("https://git.example.com/org/team/repo", "PackName")).toBe(
      "org/PackName",
    );
  });

  it("§9.6 includes inference_version v0.1 whenever inferredPackId is present", () => {
    const inference = inferPackId({
      repositoryUrl: "https://github.com/obra/superpowers",
      manifests: [{ source: "package.json", name: "superpowers" }],
    });

    expect(inference.inferredPackId).toBe("d932cd6d-1c14-527d-b2e7-185c717b7a0d");
    expect(inference.inferenceVersion).toBe(PACK_INFERENCE_VERSION);
  });
});

describe("pack membership predicate §8.3", () => {
  it("matches inferred membership only when publisher_section.pack_id is absent", () => {
    const item = {
      publisher_section: {},
      registry_section: { inferred_pack_id: INFERRED_PACK_ID },
    };

    expect(isPackMember(item, INFERRED_PACK_ID)).toBe(true);
    expect(resolvePackMembership(item, [INFERRED_PACK_ID])).toEqual({
      memberOf: INFERRED_PACK_ID,
      packResolution: "inferred",
      install: "proceed",
    });
  });

  it("does not use inferred membership when a declared pack_id slot is present", () => {
    const item = {
      publisher_section: { pack_id: null },
      registry_section: { inferred_pack_id: INFERRED_PACK_ID },
    };

    expect(isPackMember(item, INFERRED_PACK_ID)).toBe(false);
    expect(resolvePackMembership(item, [INFERRED_PACK_ID])).toEqual({ install: "proceed" });
  });
});
