export const ACIF_REQUIRES_CONTENT_TYPES = [
  "hook",
  "skill",
  "rule",
  "command",
  "agent",
  "mcp_config",
] as const;

export type AcifRequiresContentType = (typeof ACIF_REQUIRES_CONTENT_TYPES)[number];

export type AcifRequiresDisposition = "recognized" | "derivable" | "out-of-scope-at-l1";

export interface AcifRequiresVocabulary {
  readonly recognized: readonly string[];
  readonly derivable: readonly string[];
  readonly outOfScopeAtL1: readonly string[];
}

export const ACIF_REQUIRES_VOCABULARY = {
  hook: {
    recognized: [],
    derivable: ["handler_types", "matcher_patterns", "async_execution"],
    outOfScopeAtL1: [
      "hook_scopes",
      "decision_control",
      "input_modification",
      "json_io_protocol",
      "context_injection",
      "permission_control",
    ],
  },
  skill: {
    recognized: [],
    derivable: ["auto_invocable", "disable_model_invocation", "user_invocable", "skill_bundled_resources"],
    outOfScopeAtL1: [
      "display_name",
      "description",
      "license",
      "compatibility",
      "metadata_map",
      "version",
      "project_scope",
      "global_scope",
      "shared_scope",
      "canonical_filename",
      "custom_filename",
    ],
  },
  rule: {
    recognized: [],
    derivable: ["activation_mode"],
    outOfScopeAtL1: ["file_imports", "cross_provider_recognition", "auto_memory", "hierarchical_loading"],
  },
  command: {
    recognized: [],
    derivable: [],
    outOfScopeAtL1: ["argument_substitution", "builtin_commands"],
  },
  agent: {
    recognized: [],
    derivable: ["tool_restrictions", "model_selection", "per_agent_mcp", "subagent_spawning"],
    outOfScopeAtL1: ["definition_format", "invocation_patterns", "agent_scopes"],
  },
  mcp_config: {
    recognized: [],
    derivable: ["transport_types", "oauth_support", "env_var_expansion", "tool_filtering", "auto_approve"],
    outOfScopeAtL1: ["marketplace", "enterprise_management", "resource_referencing"],
  },
} as const satisfies Record<AcifRequiresContentType, AcifRequiresVocabulary>;

export const ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID = "acif.requires.orphan_key" as const;

export type AcifRequiresRejectionId = typeof ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID;

export interface AcifRequiresRejection {
  readonly id: AcifRequiresRejectionId;
  readonly code: AcifRequiresRejectionId;
  readonly params: Readonly<{ key: string }>;
}

export type AcifRequiresValidationResult =
  | { readonly ok: true; readonly requires?: AcifRequiresMap; readonly rejections: readonly [] }
  | { readonly ok: false; readonly rejections: readonly AcifRequiresRejection[] };

export type AcifRequiresStatus = "satisfied" | "unsatisfied" | "unknown";

export interface AcifRequiresKeyEvaluation {
  readonly key: string;
  readonly requirement: unknown;
  readonly status: AcifRequiresStatus;
}

export interface AcifRequiresEvaluation {
  readonly overall: AcifRequiresStatus;
  readonly keys: readonly AcifRequiresKeyEvaluation[];
  readonly satisfiedKeys: readonly string[];
  readonly unsatisfiedKeys: readonly string[];
  readonly unknownKeys: readonly string[];
}

export type AcifRequiresEvaluatorResult = AcifRequiresStatus | boolean | undefined;
export type AcifRequiresEvaluator = (key: string, requirement: unknown) => AcifRequiresEvaluatorResult;

export interface AcifRequiresInstallDecision {
  readonly decision: "proceed" | "refuse";
  readonly reason?: "unsatisfied" | "unknown";
  readonly unsatisfiedKeys: readonly string[];
  readonly unknownKeys: readonly string[];
}

export interface AcifRequiresInstallDecisionOptions {
  readonly ignoreUnknown?: boolean;
}

export type AcifRequiresMap = Readonly<Record<string, unknown>>;

type JsonRecord = Record<string, unknown>;

const RECOGNIZED_REQUIRES_KEY_SETS: Readonly<Record<AcifRequiresContentType, ReadonlySet<string>>> = {
  hook: new Set<string>(ACIF_REQUIRES_VOCABULARY.hook.recognized),
  skill: new Set<string>(ACIF_REQUIRES_VOCABULARY.skill.recognized),
  rule: new Set<string>(ACIF_REQUIRES_VOCABULARY.rule.recognized),
  command: new Set<string>(ACIF_REQUIRES_VOCABULARY.command.recognized),
  agent: new Set<string>(ACIF_REQUIRES_VOCABULARY.agent.recognized),
  mcp_config: new Set<string>(ACIF_REQUIRES_VOCABULARY.mcp_config.recognized),
};

export function recognizedRequiresKeysForContentType(
  contentType: AcifRequiresContentType,
): readonly string[] {
  return ACIF_REQUIRES_VOCABULARY[contentType].recognized;
}

export function isRecognizedRequiresKey(
  contentType: AcifRequiresContentType,
  key: string,
): boolean {
  return RECOGNIZED_REQUIRES_KEY_SETS[contentType].has(key);
}

export function requiresDispositionForContentType(
  contentType: AcifRequiresContentType,
  key: string,
): AcifRequiresDisposition | undefined {
  const vocabulary = ACIF_REQUIRES_VOCABULARY[contentType];
  const recognized = vocabulary.recognized as readonly string[];
  const derivable = vocabulary.derivable as readonly string[];
  const outOfScopeAtL1 = vocabulary.outOfScopeAtL1 as readonly string[];

  if (recognized.includes(key)) {
    return "recognized";
  }
  if (derivable.includes(key)) {
    return "derivable";
  }
  if (outOfScopeAtL1.includes(key)) {
    return "out-of-scope-at-l1";
  }
  return undefined;
}

export function normalizeRequiresSlot(requires: unknown): AcifRequiresMap | undefined {
  if (requires === undefined) {
    return undefined;
  }
  assertRequiresMap(requires);
  return Object.keys(requires).length === 0 ? undefined : requires;
}

export function normalizeRequiresInExtensionBlock<T extends JsonRecord>(block: T): Omit<T, "requires"> & {
  readonly requires?: AcifRequiresMap;
} {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(block)) {
    if (key !== "requires") {
      output[key] = value;
    }
  }

  if (Object.hasOwn(block, "requires")) {
    const normalizedRequires = normalizeRequiresSlot(block.requires);
    if (normalizedRequires !== undefined) {
      output.requires = normalizedRequires;
    }
  }

  return output as Omit<T, "requires"> & { readonly requires?: AcifRequiresMap };
}

export function validateRequiresSlotForContentType(
  contentType: AcifRequiresContentType,
  requires: unknown,
): AcifRequiresValidationResult {
  const normalizedRequires = normalizeRequiresSlot(requires);
  if (normalizedRequires === undefined) {
    return { ok: true, rejections: [] };
  }

  const rejections = Object.keys(normalizedRequires)
    .sort(compareUtf16CodeUnits)
    .filter((key) => !isRecognizedRequiresKey(contentType, key))
    .map(requiresOrphanKeyRejection);

  if (rejections.length > 0) {
    return { ok: false, rejections };
  }

  return { ok: true, requires: normalizedRequires, rejections: [] };
}

export function requiresOrphanKeyRejection(key: string): AcifRequiresRejection {
  return {
    id: ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID,
    code: ACIF_REQUIRES_ORPHAN_KEY_REJECTION_ID,
    params: { key },
  };
}

export function evaluateRequires(
  requires: unknown,
  evaluator: AcifRequiresEvaluator = () => undefined,
): AcifRequiresEvaluation {
  const normalizedRequires = normalizeRequiresSlot(requires);
  if (normalizedRequires === undefined) {
    return {
      overall: "satisfied",
      keys: [],
      satisfiedKeys: [],
      unsatisfiedKeys: [],
      unknownKeys: [],
    };
  }

  const keys = Object.keys(normalizedRequires).sort(compareUtf16CodeUnits);
  const keyEvaluations = keys.map((key) => ({
    key,
    requirement: normalizedRequires[key],
    status: normalizeEvaluatorResult(evaluator(key, normalizedRequires[key])),
  }));

  const satisfiedKeys = keyEvaluations
    .filter((evaluation) => evaluation.status === "satisfied")
    .map((evaluation) => evaluation.key);
  const unsatisfiedKeys = keyEvaluations
    .filter((evaluation) => evaluation.status === "unsatisfied")
    .map((evaluation) => evaluation.key);
  const unknownKeys = keyEvaluations
    .filter((evaluation) => evaluation.status === "unknown")
    .map((evaluation) => evaluation.key);

  return {
    overall: overallRequiresStatus({ unsatisfiedKeys, unknownKeys }),
    keys: keyEvaluations,
    satisfiedKeys,
    unsatisfiedKeys,
    unknownKeys,
  };
}

export function decideRequiresInstall(
  evaluation: AcifRequiresEvaluation,
  options: AcifRequiresInstallDecisionOptions = {},
): AcifRequiresInstallDecision {
  if (evaluation.unsatisfiedKeys.length > 0) {
    return {
      decision: "refuse",
      reason: "unsatisfied",
      unsatisfiedKeys: evaluation.unsatisfiedKeys,
      unknownKeys: evaluation.unknownKeys,
    };
  }

  if (!options.ignoreUnknown && evaluation.unknownKeys.length > 0) {
    return {
      decision: "refuse",
      reason: "unknown",
      unsatisfiedKeys: evaluation.unsatisfiedKeys,
      unknownKeys: evaluation.unknownKeys,
    };
  }

  return {
    decision: "proceed",
    unsatisfiedKeys: evaluation.unsatisfiedKeys,
    unknownKeys: evaluation.unknownKeys,
  };
}

function assertRequiresMap(value: unknown): asserts value is AcifRequiresMap {
  if (!isJsonRecord(value)) {
    throw new TypeError("requires must be a parsed JSON object when present");
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEvaluatorResult(value: AcifRequiresEvaluatorResult): AcifRequiresStatus {
  if (value === true) {
    return "satisfied";
  }
  if (value === false) {
    return "unsatisfied";
  }
  if (value === "satisfied" || value === "unsatisfied" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function overallRequiresStatus(input: {
  readonly unsatisfiedKeys: readonly string[];
  readonly unknownKeys: readonly string[];
}): AcifRequiresStatus {
  if (input.unknownKeys.length > 0) {
    return "unknown";
  }
  if (input.unsatisfiedKeys.length > 0) {
    return "unsatisfied";
  }
  return "satisfied";
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
