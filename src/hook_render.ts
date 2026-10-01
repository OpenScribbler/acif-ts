import { canonicalJson } from "./canonical";
import { selectScript } from "./hook_platform";
import { AcifBodyHashError } from "./body_hash";
import { getHookEventNativeNames, HOOK_EVENT_PROVIDERS } from "./hook";

export interface HookEventRenderPin {
  readonly canonical: string;
  readonly provider: string;
  readonly target: string;
  readonly fidelity: "lossless" | "degraded";
}

// Appendix A.4 pins are independent of A.1: the spec says adding A.1 names
// does not change these selected render targets or their fidelity classes.
export const HOOK_EVENT_RENDER_PINS: readonly HookEventRenderPin[] = [
  {
    canonical: "before_prompt",
    provider: "devin",
    target: "UserPromptSubmit",
    fidelity: "lossless",
  },
  { canonical: "agent_stop", provider: "devin", target: "Stop", fidelity: "lossless" },
  {
    canonical: "session_start",
    provider: "devin",
    target: "SessionStart",
    fidelity: "lossless",
  },
  { canonical: "session_end", provider: "devin", target: "SessionEnd", fidelity: "lossless" },
  {
    canonical: "worktree_create",
    provider: "devin",
    target: "post_setup_worktree",
    fidelity: "degraded",
  },
  {
    canonical: "transcript_export",
    provider: "devin",
    target: "post_cascade_response_with_transcript",
    fidelity: "degraded",
  },
  { canonical: "file_changed", provider: "devin", target: "post_write_code", fidelity: "degraded" },
  {
    canonical: "before_shell_execute",
    provider: "devin",
    target: "pre_run_command",
    fidelity: "degraded",
  },
  {
    canonical: "after_shell_execute",
    provider: "devin",
    target: "post_run_command",
    fidelity: "degraded",
  },
  {
    canonical: "before_mcp_execute",
    provider: "devin",
    target: "pre_mcp_tool_use",
    fidelity: "degraded",
  },
  {
    canonical: "after_mcp_execute",
    provider: "devin",
    target: "post_mcp_tool_use",
    fidelity: "degraded",
  },
  {
    canonical: "before_file_read",
    provider: "devin",
    target: "pre_read_code",
    fidelity: "degraded",
  },
  {
    canonical: "after_model",
    provider: "cursor",
    target: "afterAgentResponse",
    fidelity: "degraded",
  },
];

export interface HookEventRenderDiagnostic {
  readonly id: "acif.hook.event_untranslatable";
  readonly params: { readonly event: string; readonly provider: string };
}

export interface HookEventRenderResolution {
  readonly event: string;
  readonly diagnostics: readonly HookEventRenderDiagnostic[];
}

export interface HookEventRenderOptions {
  readonly providerListedInA1: boolean;
  readonly nativeNames?: readonly string[];
  readonly pin?: HookEventRenderPin;
}

/** Applies the ordered Appendix A.4 rules to one canonical/provider pair. */
export function resolveHookEventRender(
  canonicalEvent: string,
  provider: string,
  options: HookEventRenderOptions,
): HookEventRenderResolution {
  const diagnostic: HookEventRenderDiagnostic = {
    id: "acif.hook.event_untranslatable",
    params: { event: canonicalEvent, provider },
  };

  // Rule 1: an explicit A.4 pin wins, including when it marks a pair degraded.
  if (options.pin) {
    return {
      event: options.pin.target,
      diagnostics: options.pin.fidelity === "degraded" ? [diagnostic] : [],
    };
  }

  // Rule 5: providers outside A.1 receive canonical names without a warning.
  if (!options.providerListedInA1) {
    return { event: canonicalEvent, diagnostics: [] };
  }

  const nativeNames = options.nativeNames ?? [];
  // Rule 2: exactly one A.1 name is the lossless target.
  if (nativeNames.length === 1) {
    return { event: nativeNames[0], diagnostics: [] };
  }

  // Rule 3: an unpinned multi-name pair has no deterministic native target.
  if (nativeNames.length > 1) {
    return { event: canonicalEvent, diagnostics: [diagnostic] };
  }

  // Rule 4: the provider is listed in A.1 but this event has no native name.
  return { event: canonicalEvent, diagnostics: [diagnostic] };
}

export interface RenderResult {
  readonly output: string;
  readonly diagnostics: readonly any[];
}

export function renderHookBlock(canonicalHook: any, target: string, targetOs?: string): RenderResult {
  if (target === "per-os-key-map-provider") {
    const handler = canonicalHook.handlers?.find((h: any) => h.type === "command");
    const scripts = handler?.scripts || [];
    const nativeKeyMap: any = {};
    for (const script of scripts) {
      if (script.os) {
        if (script.os.includes("windows")) {
          nativeKeyMap.windows = script.path;
        }
        if (script.os.includes("linux")) {
          nativeKeyMap.linux = script.path;
        }
        if (script.os.includes("darwin")) {
          nativeKeyMap.osx = script.path;
        }
      } else {
        nativeKeyMap.command = script.path;
      }
      if (!script.os) {
        for (const [key, val] of Object.entries(script)) {
          if (key !== "path" && key !== "os" && key !== "arch" && key !== "type" && key !== "content") {
            nativeKeyMap[key] = val;
          }
        }
      }
    }
    return {
      output: canonicalJson(nativeKeyMap),
      diagnostics: [],
    };
  }

  const diagnostics: any[] = [];

  // Resolve the canonical/provider pair using Appendix A.4's ordered rules.
  const canonicalEvent = canonicalHook.event;
  let renderedEvent = canonicalEvent;
  if (typeof canonicalEvent === "string" && canonicalEvent.length > 0) {
    const pin = HOOK_EVENT_RENDER_PINS.find(
      (row) => row.canonical === canonicalEvent && row.provider === target,
    );
    const resolution = resolveHookEventRender(canonicalEvent, target, {
      providerListedInA1: HOOK_EVENT_PROVIDERS.has(target),
      nativeNames: getHookEventNativeNames(canonicalEvent, target),
      pin,
    });
    renderedEvent = resolution.event;
    diagnostics.push(...resolution.diagnostics);
  }

  const isPerOsMechanism = target === "per-os-key-map" || target === "per-os-key-map-provider";

  const renderedHandlers: any[] = [];

  const handlers = canonicalHook.handlers || [];
  for (const handler of handlers) {
    if (handler.type !== "command") {
      // Non-command handlers are rendered verbatim
      renderedHandlers.push({ ...handler });
      continue;
    }

    const scripts = handler.scripts || [];
    if (isPerOsMechanism) {
      // 1. Render to per-OS key-map (lossless)
      const renderedHandler: any = { type: handler.type };
      for (const [key, val] of Object.entries(handler)) {
        if (key !== "type" && key !== "scripts") {
          renderedHandler[key] = val;
        }
      }

      for (const script of scripts) {
        if (script.os) {
          if (script.os.includes("windows")) {
            renderedHandler.windows = script.path;
          }
          if (script.os.includes("linux")) {
            renderedHandler.linux = script.path;
          }
          if (script.os.includes("darwin")) {
            renderedHandler.osx = script.path;
          }
        } else {
          renderedHandler.command = script.path;
        }

        // Copy other passthrough properties from script entry
        for (const [key, val] of Object.entries(script)) {
          if (key !== "path" && key !== "os" && key !== "arch" && key !== "type" && key !== "content") {
            renderedHandler[key] = val;
          }
        }
      }

      renderedHandlers.push(renderedHandler);
    } else {
      // 2. Render to no-mechanism provider (degradation)
      const defaultEntry = scripts.find((s: any) => !s.os);
      const hasConstrained = scripts.some((s: any) => s.os && s.os.length > 0);

      let selectedScriptEntry: any = null;

      if (defaultEntry) {
        selectedScriptEntry = defaultEntry;
        if (hasConstrained) {
          // Constrained entries dropped! Emit diagnostic
          diagnostics.push({
            id: "acif.hook.platform_override_dropped",
            message: "Platform overrides dropped during rendering to a no-mechanism target."
          });
        }
      } else {
        // All-constrained hook
        if (targetOs) {
          const selectResult = selectScript(scripts, targetOs);
          if (selectResult.selected) {
            selectedScriptEntry = selectResult.selected;
            // Also emit platform override dropped diagnostic because we are dropping other constraints
            if (scripts.length > 1) {
              diagnostics.push({
                id: "acif.hook.platform_override_dropped",
                message: "Platform overrides dropped during rendering to a no-mechanism target."
              });
            }
          } else {
            throw new AcifBodyHashError(
              "acif.hook.no_default_for_degraded_render",
              `Refusing to render: no default entry is available and selection for target OS '${targetOs}' yielded no script.`
            );
          }
        } else {
          throw new AcifBodyHashError(
            "acif.hook.no_default_for_degraded_render",
            "Refusing to render: no default entry is available and no target OS was specified."
          );
        }
      }

      const renderedHandler: any = { type: handler.type };
      for (const [key, val] of Object.entries(handler)) {
        if (key !== "type" && key !== "scripts") {
          renderedHandler[key] = val;
        }
      }

      // We preserve the scripts array but with only the selected/default entry in it
      renderedHandler.scripts = [selectedScriptEntry];

      renderedHandlers.push(renderedHandler);
    }
  }

  const renderedHook: any = { ...canonicalHook };
  if (canonicalHook.event) {
    renderedHook.event = renderedEvent;
  }
  renderedHook.handlers = renderedHandlers;

  return {
    output: canonicalJson(renderedHook),
    diagnostics,
  };
}
