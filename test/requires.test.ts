import { describe, expect, it } from "vitest";

import {
  ACIF_REQUIRES_CONTENT_TYPES,
  ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID,
  ACIF_REQUIRES_VOCABULARY,
  type AcifRequiresContentType,
  type AcifRequiresMap,
  decideRequiresInstall,
  evaluateRequires,
  normalizeRequiresInExtensionBlock,
  normalizeRequiresSlot,
  recognizedRequiresKeysForContentType,
  requiresDispositionForContentType,
  validateRequiresSlotForContentType,
} from "../src/requires";

function expectEmptyRequiresConformant(
  contentType: AcifRequiresContentType,
  block: Record<string, unknown>,
): void {
  const result = validateRequiresSlotForContentType(
    contentType,
    Object.hasOwn(block, "requires") ? block.requires : undefined,
  );

  expect(result).toEqual({ ok: true, rejections: [] });
  expect(normalizeRequiresInExtensionBlock(block)).not.toHaveProperty("requires");
}

function expectOrphanKey(
  contentType: AcifRequiresContentType,
  requires: AcifRequiresMap,
  key: string,
): void {
  const result = validateRequiresSlotForContentType(contentType, requires);

  expect(result).toEqual({
    ok: false,
    rejections: [
      {
        id: ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID,
        code: ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID,
        params: { key },
      },
    ],
  });
}

function expectUnknownRequiresVector(input: {
  consumer_recognizes: readonly string[];
  item_requires: AcifRequiresMap;
}): void {
  const consumerRecognizes = new Set(input.consumer_recognizes);
  const evaluation = evaluateRequires(input.item_requires, (key) =>
    consumerRecognizes.has(key) ? "satisfied" : undefined,
  );

  expect(evaluation.overall).toBe("unknown");
  expect(evaluation.keys).toEqual(
    Object.entries(input.item_requires).map(([key, requirement]) => ({
      key,
      requirement,
      status: "unknown",
    })),
  );
  expect(decideRequiresInstall(evaluation)).toEqual({
    decision: "refuse",
    reason: "unknown",
    unsatisfiedKeys: [],
    unknownKeys: Object.keys(input.item_requires),
  });
  expect(decideRequiresInstall(evaluation, { ignoreUnknown: true })).toEqual({
    decision: "proceed",
    unsatisfiedKeys: [],
    unknownKeys: Object.keys(input.item_requires),
  });
}

describe("requires conformance vectors", () => {
  it("TV-HOOK-a accepts empty and absent hook.requires as one canonical state", () => {
    const input = {
      variants: [
        {
          hook: {
            event: "session_start",
            handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\necho hi\n" }] }],
            requires: {},
          },
        },
        {
          hook: {
            event: "session_start",
            handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\necho hi\n" }] }],
          },
        },
      ],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("hook", variant.hook);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-HOOK-b rejects a DERIVABLE hook key as acif.requires.orphan_key", () => {
    const input = {
      hook: {
        event: "session_start",
        handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\necho hi\n" }] }],
        requires: { handler_types: ["command"] },
      },
    };
    const expectVector = {
      conformant: false,
      reason: "acif.requires.orphan_key",
      reason_note: "derivable-key-never-requires",
      params: { key: "handler_types" },
    };

    expectOrphanKey("hook", input.hook.requires, expectVector.params.key);
  });

  it("TV-HOOK-c evaluates an unknown hook requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { gpu_access: true },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-SKILL-a accepts empty and absent skill.requires as one canonical state", () => {
    const input = {
      variants: [
        { skill: { activation: { type: "auto", user_invocable: true }, requires: {} } },
        { skill: { activation: { type: "auto", user_invocable: true } } },
      ],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("skill", variant.skill);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-SKILL-b rejects foreign and latent-field skill requires keys uniformly", () => {
    const input = {
      foreign: { skill: { requires: { handler_types: ["command"] } } },
      latent_match: { skill: { requires: { tool_restrictions: true } }, frontmatter_passthrough: { allowed_tools: ["Read"] } },
    };
    const expectVector = {
      foreign: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "foreign-type-key",
        params: { key: "handler_types" },
      },
      latent_match: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "latent-field-presence-does-not-soften",
        params: { key: "tool_restrictions" },
      },
    };

    expectOrphanKey("skill", input.foreign.skill.requires, expectVector.foreign.params.key);
    expectOrphanKey("skill", input.latent_match.skill.requires, expectVector.latent_match.params.key);
  });

  it("TV-SKILL-c evaluates an unknown skill requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { python_version: ">=3.10" },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-COMMAND-i accepts empty and absent command.requires as one canonical state", () => {
    const input = {
      variants: [{ command: { requires: {} } }, { command: {} }],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("command", variant.command);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-COMMAND-j rejects four command orphan-key causes with one outcome", () => {
    const input = {
      cases: [
        { command: { requires: { argument_substitution: true } } },
        { command: { requires: { builtin_commands: true } } },
        { command: { requires: { handler_types: ["command"] } } },
        { command: { model: "model-a", requires: { disable_model_invocation: true } } },
      ],
    };
    const expectVector = {
      case_1: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "considered-and-disposed",
        params: { key: "argument_substitution" },
      },
      case_2: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "out-of-scope-key",
        params: { key: "builtin_commands" },
      },
      case_3: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "foreign-type-key",
        params: { key: "handler_types" },
      },
      case_4: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "latent-field-presence-does-not-soften",
        params: { key: "disable_model_invocation" },
      },
    };

    expectOrphanKey("command", input.cases[0].command.requires, expectVector.case_1.params.key);
    expectOrphanKey("command", input.cases[1].command.requires, expectVector.case_2.params.key);
    expectOrphanKey("command", input.cases[2].command.requires, expectVector.case_3.params.key);
    expectOrphanKey("command", input.cases[3].command.requires, expectVector.case_4.params.key);
  });

  it("TV-COMMAND-k evaluates an unknown command requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { sandbox: true },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-RULE-h accepts empty and absent rule.requires as one canonical state", () => {
    const input = {
      variants: [
        { rule: { activation: { mode: "always" }, requires: {} } },
        { rule: { activation: { mode: "always" } } },
      ],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("rule", variant.rule);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-RULE-i rejects three rule orphan-key causes with one outcome", () => {
    const input = {
      cases: [
        { rule: { requires: { file_imports: true } } },
        { rule: { requires: { activation_mode: "glob" } } },
        { rule: { requires: { handler_types: ["command"] } } },
      ],
    };
    const expectVector = {
      case_1: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "considered-and-rejected-candidate",
        params: { key: "file_imports" },
      },
      case_2: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "derivable-key-never-requires",
        params: { key: "activation_mode" },
      },
      case_3: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "foreign-type-key",
        params: { key: "handler_types" },
      },
    };

    expectOrphanKey("rule", input.cases[0].rule.requires, expectVector.case_1.params.key);
    expectOrphanKey("rule", input.cases[1].rule.requires, expectVector.case_2.params.key);
    expectOrphanKey("rule", input.cases[2].rule.requires, expectVector.case_3.params.key);
  });

  it("TV-RULE-j evaluates an unknown rule requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { import_resolution: true },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-MCP-e accepts empty and absent mcp.requires as one canonical state", () => {
    const input = {
      variants: [
        { mcp: { servers: { demo: { type: "stdio", command: "npx" } }, requires: {} } },
        { mcp: { servers: { demo: { type: "stdio", command: "npx" } } } },
      ],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("mcp_config", variant.mcp);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-MCP-f evaluates an unknown mcp requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { quantum_transport: true },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-MCP-g rejects transport_types on mcp_config and skill as orphan keys", () => {
    const input = {
      on_mcp_item: { requires: { transport_types: ["stdio"] } },
      on_skill_item: { requires: { transport_types: ["stdio"] } },
    };
    const expectVector = {
      on_mcp_item: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "derivable-key-never-requires",
        params: { key: "transport_types" },
      },
      on_skill_item: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "foreign-type-key",
        params: { key: "transport_types" },
      },
    };

    expectOrphanKey("mcp_config", input.on_mcp_item.requires, expectVector.on_mcp_item.params.key);
    expectOrphanKey("skill", input.on_skill_item.requires, expectVector.on_skill_item.params.key);
  });

  it("TV-AGENT-a accepts empty and absent agent.requires as one canonical state", () => {
    const input = {
      variants: [{ agent: { requires: {} } }, { agent: {} }],
    };
    const expectVector = { conformant: true };

    for (const variant of input.variants) {
      expectEmptyRequiresConformant("agent", variant.agent);
    }
    expect(expectVector).toEqual({ conformant: true });
  });

  it("TV-AGENT-b evaluates an unknown agent requires key as three-valued unknown", () => {
    const input = {
      consumer_recognizes: [],
      item_requires: { handoff_chains: true },
    };
    const expectVector = {
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    };

    expectUnknownRequiresVector(input);
    expect(expectVector).toEqual({
      evaluation: "unknown",
      install: "refuse-unless-operator-opt-in",
    });
  });

  it("TV-AGENT-c rejects tool_restrictions on agent and rule as orphan keys", () => {
    const input = {
      on_agent: { agent: { requires: { tool_restrictions: true } } },
      on_rule: { rule: { requires: { tool_restrictions: true } } },
    };
    const expectVector = {
      on_agent: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "derivable-key-never-requires",
        params: { key: "tool_restrictions" },
      },
      on_rule: {
        conformant: false,
        reason: "acif.requires.orphan_key",
        reason_note: "foreign-type-key",
        params: { key: "tool_restrictions" },
      },
    };

    expectOrphanKey("agent", input.on_agent.agent.requires, expectVector.on_agent.params.key);
    expectOrphanKey("rule", input.on_rule.rule.requires, expectVector.on_rule.params.key);
  });
});

describe("requires unit coverage", () => {
  it("exports empty recognized requires vocabularies for every ACIF 0.1 content type", () => {
    for (const contentType of ACIF_REQUIRES_CONTENT_TYPES) {
      expect(recognizedRequiresKeysForContentType(contentType)).toEqual([]);
      expect(ACIF_REQUIRES_VOCABULARY[contentType].recognized).toEqual([]);
    }
  });

  it("§9.1 treats absent and empty requires as one canonical state", () => {
    expect(normalizeRequiresSlot(undefined)).toBeUndefined();
    expect(normalizeRequiresSlot({})).toBeUndefined();
    expect(normalizeRequiresInExtensionBlock({ requires: {}, activation: { mode: "always" } })).toEqual({
      activation: { mode: "always" },
    });
    expect(evaluateRequires({}, () => "unsatisfied")).toEqual({
      overall: "satisfied",
      keys: [],
      satisfiedKeys: [],
      unsatisfiedKeys: [],
      unknownKeys: [],
    });
  });

  it("§9.4 reports uniform orphan-key rejection with only the key param", () => {
    const cases: readonly [AcifRequiresContentType, AcifRequiresMap, string][] = [
      ["hook", { handler_types: ["command"] }, "handler_types"],
      ["command", { argument_substitution: true }, "argument_substitution"],
      ["command", { handler_types: ["command"] }, "handler_types"],
      ["command", { disable_model_invocation: true }, "disable_model_invocation"],
      ["agent", { future_runtime: true }, "future_runtime"],
    ];

    for (const [contentType, requires, key] of cases) {
      expectOrphanKey(contentType, requires, key);
    }
  });

  it("§9.5 keeps satisfied, unsatisfied, and unknown as distinct statuses", () => {
    const evaluation = evaluateRequires(
      {
        gpu_access: true,
        network: "none",
        python_version: ">=3.10",
      },
      (key) => {
        if (key === "gpu_access") {
          return true;
        }
        if (key === "network") {
          return false;
        }
        return undefined;
      },
    );

    expect(evaluation).toEqual({
      overall: "unknown",
      keys: [
        { key: "gpu_access", requirement: true, status: "satisfied" },
        { key: "network", requirement: "none", status: "unsatisfied" },
        { key: "python_version", requirement: ">=3.10", status: "unknown" },
      ],
      satisfiedKeys: ["gpu_access"],
      unsatisfiedKeys: ["network"],
      unknownKeys: ["python_version"],
    });
    expect(decideRequiresInstall(evaluation)).toEqual({
      decision: "refuse",
      reason: "unsatisfied",
      unsatisfiedKeys: ["network"],
      unknownKeys: ["python_version"],
    });
  });

  it("§9.5 refuses unknown requirements unless the operator opts into ignore-unknown", () => {
    const evaluation = evaluateRequires({ python_version: ">=3.10" });

    expect(decideRequiresInstall(evaluation)).toEqual({
      decision: "refuse",
      reason: "unknown",
      unsatisfiedKeys: [],
      unknownKeys: ["python_version"],
    });
    expect(decideRequiresInstall(evaluation, { ignoreUnknown: true })).toEqual({
      decision: "proceed",
      unsatisfiedKeys: [],
      unknownKeys: ["python_version"],
    });
  });

  it("records §9.2 dispositions without making disposed keys recognized", () => {
    expect(requiresDispositionForContentType("hook", "handler_types")).toBe("derivable");
    expect(requiresDispositionForContentType("rule", "file_imports")).toBe("out-of-scope-at-l1");
    expect(requiresDispositionForContentType("mcp_config", "quantum_transport")).toBeUndefined();
  });
});
