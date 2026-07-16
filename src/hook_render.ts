import { canonicalJson } from "./canonical";
import { selectScript } from "./hook_platform";
import { AcifBodyHashError } from "./body_hash";

export const CANONICAL_TO_NATIVE_EVENT: Record<string, Record<string, string>> = {
  before_tool_execute: {
    "claude-code": "PreToolUse",
    "gemini-cli": "BeforeTool",
    "copilot-cli": "preToolUse",
    "kiro": "preToolUse",
    "cursor": "PreToolUse",
    "opencode": "tool.execute.before",
    "vs-code-copilot": "PreToolUse",
    "factory-droid": "PreToolUse",
    "pi": "tool_call"
  },
  after_tool_execute: {
    "claude-code": "PostToolUse",
    "gemini-cli": "AfterTool",
    "copilot-cli": "postToolUse",
    "kiro": "postToolUse",
    "cursor": "PostToolUse",
    "opencode": "tool.execute.after",
    "vs-code-copilot": "PostToolUse",
    "factory-droid": "PostToolUse",
    "pi": "tool_result"
  },
  before_prompt: {
    "claude-code": "UserPromptSubmit",
    "gemini-cli": "BeforeAgent",
    "copilot-cli": "userPromptSubmitted",
    "kiro": "userPromptSubmit",
    "cursor": "UserPromptSubmit",
    "windsurf": "pre_user_prompt",
    "vs-code-copilot": "UserPromptSubmit",
    "factory-droid": "UserPromptSubmit",
    "pi": "input"
  },
  agent_stop: {
    "claude-code": "Stop",
    "gemini-cli": "AfterAgent",
    "kiro": "stop",
    "copilot-cli": "agentStop",
    "cursor": "Stop",
    "windsurf": "post_cascade_response",
    "opencode": "session.idle",
    "vs-code-copilot": "Stop",
    "factory-droid": "Stop",
    "pi": "agent_end"
  },
  session_start: {
    "claude-code": "SessionStart",
    "gemini-cli": "SessionStart",
    "copilot-cli": "sessionStart",
    "kiro": "agentSpawn",
    "cursor": "SessionStart",
    "windsurf": "session_start",
    "opencode": "session.created",
    "vs-code-copilot": "SessionStart",
    "factory-droid": "SessionStart",
    "pi": "session_start"
  },
  session_end: {
    "claude-code": "SessionEnd",
    "gemini-cli": "SessionEnd",
    "copilot-cli": "sessionEnd",
    "cursor": "SessionEnd",
    "windsurf": "session_end",
    "factory-droid": "SessionEnd",
    "pi": "session_shutdown"
  },
  before_compact: {
    "claude-code": "PreCompact",
    "gemini-cli": "PreCompress",
    "cursor": "PreCompact",
    "vs-code-copilot": "PreCompact",
    "factory-droid": "PreCompact",
    "pi": "session_before_compact"
  },
  notification: {
    "claude-code": "Notification",
    "gemini-cli": "Notification"
  },
  subagent_start: {
    "claude-code": "SubagentStart",
    "cursor": "SubagentStart",
    "vs-code-copilot": "SubagentStart",
    "factory-droid": "SubagentStart",
    "pi": "before_agent_start"
  },
  subagent_stop: {
    "claude-code": "SubagentStop",
    "copilot-cli": "subagentStop",
    "cursor": "SubagentStop",
    "vs-code-copilot": "SubagentStop",
    "factory-droid": "SubagentStop"
  },
  error_occurred: {
    "claude-code": "ErrorOccurred",
    "copilot-cli": "errorOccurred",
    "opencode": "session.error"
  },
  tool_use_failure: {
    "claude-code": "PostToolUseFailure",
    "cursor": "postToolUseFailure",
    "copilot-cli": "errorOccurred"
  },
  permission_request: {
    "claude-code": "PermissionRequest",
    "opencode": "permission.asked"
  },
  after_compact: {
    "claude-code": "PostCompact"
  },
  instructions_loaded: {
    "claude-code": "InstructionsLoaded"
  },
  config_change: {
    "claude-code": "ConfigChange"
  },
  worktree_create: {
    "claude-code": "WorktreeCreate",
    "windsurf": "post_setup_worktree"
  },
  worktree_remove: {
    "claude-code": "WorktreeRemove"
  },
  elicitation: {
    "claude-code": "Elicitation"
  },
  elicitation_result: {
    "claude-code": "ElicitationResult"
  },
  teammate_idle: {
    "claude-code": "TeammateIdle"
  },
  task_completed: {
    "claude-code": "TaskCompleted"
  },
  stop_failure: {
    "claude-code": "StopFailure"
  },
  before_model: {
    "gemini-cli": "BeforeModel",
    "cursor": "beforeAgentResponse"
  },
  after_model: {
    "gemini-cli": "AfterModel",
    "cursor": "afterAgentResponse"
  },
  before_tool_selection: {
    "gemini-cli": "BeforeToolSelection",
    "cursor": "beforeToolSelection"
  },
  file_changed: {
    "claude-code": "FileChanged",
    "cursor": "afterFileEdit",
    "kiro": "File Save",
    "opencode": "file.edited"
  },
  file_created: {
    "kiro": "File Create"
  },
  file_deleted: {
    "kiro": "File Delete"
  },
  before_task: {
    "kiro": "Pre Task Execution"
  },
  after_task: {
    "kiro": "Post Task Execution"
  },
  transcript_export: {
    "windsurf": "post_cascade_response_with_transcript"
  },
  turn_start: {
    "pi": "turn_start"
  },
  turn_end: {
    "pi": "turn_end"
  },
  model_select: {
    "pi": "model_select"
  },
  user_bash: {
    "pi": "user_bash"
  },
  context_update: {
    "pi": "context"
  },
  message_start: {
    "pi": "message_start"
  },
  message_end: {
    "pi": "message_end"
  }
};

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

  // Translate event name
  const canonicalEvent = canonicalHook.event;
  let renderedEvent = canonicalEvent;
  if (canonicalEvent && CANONICAL_TO_NATIVE_EVENT[canonicalEvent]) {
    const nativeMapping = CANONICAL_TO_NATIVE_EVENT[canonicalEvent][target];
    if (nativeMapping) {
      renderedEvent = nativeMapping;
    }
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
