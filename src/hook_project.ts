import { sha256Hex } from "./body_hash";
import { selectScript } from "./hook_platform";

const UTF8 = new TextEncoder();
const OS_ENUM = ["windows", "linux", "darwin"] as const;

function getExecutableIdentity(script: any): string {
  if (script.type === "inline") {
    const content = typeof script.content === "string" ? script.content : "";
    const contentHash = sha256Hex(UTF8.encode(content));
    return `inline:${contentHash}`;
  }
  const path = typeof script.path === "string" ? script.path : "";
  return `file:${path}`;
}

export function isHandlerDivergent(handler: any): boolean {
  if (handler.type !== "command" || !Array.isArray(handler.scripts)) {
    return false;
  }

  const scripts = handler.scripts;
  const selections = OS_ENUM.map(os => {
    try {
      const res = selectScript(scripts, os);
      return res.selected ? getExecutableIdentity(res.selected) : null;
    } catch {
      return null;
    }
  });

  // Check all pairs o1 !== o2
  for (let i = 0; i < OS_ENUM.length; i++) {
    for (let j = i + 1; j < OS_ENUM.length; j++) {
      const sel1 = selections[i];
      const sel2 = selections[j];
      if (sel1 !== null && sel2 !== null && sel1 !== sel2) {
        return true;
      }
    }
  }
  return false;
}

export function determineProvenanceRollup(hook: any, provenance?: any): "declared" | "inferred-from-convention" | "mixed" {
  const handlerProvenanceList: ("declared" | "inferred-from-convention")[] = [];

  const handlers = hook.handlers || [];
  for (let hIdx = 0; hIdx < handlers.length; hIdx++) {
    const handler = handlers[hIdx];
    if (handler.type !== "command" || !Array.isArray(handler.scripts)) {
      continue;
    }
    for (let sIdx = 0; sIdx < handler.scripts.length; sIdx++) {
      const script = handler.scripts[sIdx];
      if (!Array.isArray(script.os)) {
        continue;
      }
      for (const osVal of script.os) {
        let provVal: "declared" | "inferred-from-convention" = "declared";
        if (provenance && provenance[hIdx]?.[sIdx]?.[osVal]) {
          provVal = provenance[hIdx][sIdx][osVal];
        } else if (provenance?.provenance?.[hIdx]?.[sIdx]?.[osVal]) {
          provVal = provenance.provenance[hIdx][sIdx][osVal];
        } else if (provenance?.registry_section?.provenance?.[hIdx]?.[sIdx]?.[osVal]) {
          provVal = provenance.registry_section.provenance[hIdx][sIdx][osVal];
        }
        handlerProvenanceList.push(provVal);
      }
    }
  }

  if (handlerProvenanceList.length === 0) {
    return "declared";
  }

  const allDeclared = handlerProvenanceList.every(p => p === "declared");
  const allInferred = handlerProvenanceList.every(p => p === "inferred-from-convention");

  if (allDeclared) {
    return "declared";
  }
  if (allInferred) {
    return "inferred-from-convention";
  }
  return "mixed";
}

export interface OsCoverageProjection {
  readonly derivable: boolean;
  readonly os: readonly string[];
  readonly arch: readonly string[];
  readonly unconstrained: boolean;
  readonly os_divergent: boolean;
  readonly provenance: "declared" | "inferred-from-convention" | "mixed";
}

export function projectOsCoverage(hook: any, provenanceMetadata?: any): OsCoverageProjection {
  const osSet = new Set<string>();
  const archSet = new Set<string>();
  let derivable = false;
  let unconstrained = false;
  let osDivergent = false;

  const handlers = hook.handlers || [];
  for (const handler of handlers) {
    if (handler.type === "command" && Array.isArray(handler.scripts)) {
      if (isHandlerDivergent(handler)) {
        osDivergent = true;
      }
      for (const script of handler.scripts) {
        if (Array.isArray(script.os)) {
          derivable = true;
          for (const osVal of script.os) {
            osSet.add(osVal);
          }
        } else {
          unconstrained = true;
        }
        if (Array.isArray(script.arch)) {
          for (const archVal of script.arch) {
            archSet.add(archVal);
          }
        }
      }
    }
  }

  const sortedOs = Array.from(osSet).sort();
  const sortedArch = Array.from(archSet).sort();
  const rolledProvenance = determineProvenanceRollup(hook, provenanceMetadata);

  return {
    derivable,
    os: sortedOs,
    arch: sortedArch,
    unconstrained,
    os_divergent: osDivergent,
    provenance: rolledProvenance,
  };
}

export function projectDerivedCapabilities(hook: any): Record<string, boolean> {
  const handlers = hook.handlers || [];
  const hasHandlerType = handlers.some((h: any) => typeof h.type === "string" && h.type !== "");
  const matcherPresent = "matcher" in hook && hook.matcher !== undefined && hook.matcher !== null && hook.matcher !== "";
  const asyncExecution = handlers.some((h: any) => h.async === true);

  return {
    handler_types: hasHandlerType,
    matcher_patterns: matcherPresent,
    async_execution: asyncExecution,
  };
}

export interface InstallEvaluationResult {
  readonly install: "proceed" | "refuse-unless-operator-opt-in";
  readonly diagnostics: readonly any[];
}

export function evaluateHookInstall(item: any, targetOs?: string): InstallEvaluationResult {
  if (!targetOs) {
    return {
      install: "proceed",
      diagnostics: [],
    };
  }

  const hook = item.hook || (item.kind === "hook" ? item.hook : item);
  if (!hook || !Array.isArray(hook.handlers)) {
    return {
      install: "proceed",
      diagnostics: [],
    };
  }

  const blocking = hook.blocking === true;
  const diagnostics: any[] = [];
  let hasGap = false;

  for (const handler of hook.handlers) {
    if (handler.type !== "command" || !Array.isArray(handler.scripts)) {
      continue;
    }
    const selection = selectScript(handler.scripts, targetOs);
    if (selection.selected === null) {
      hasGap = true;
      diagnostics.push(...selection.diagnostics);
    }
  }

  if (hasGap) {
    if (blocking) {
      return {
        install: "refuse-unless-operator-opt-in",
        diagnostics,
      };
    } else {
      return {
        install: "proceed",
        diagnostics,
      };
    }
  }

  return {
    install: "proceed",
    diagnostics: [],
  };
}
