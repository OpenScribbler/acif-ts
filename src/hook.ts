import { AcifBodyHashError } from "./body_hash";

export interface HookEventRow {
  readonly canonical: string;
  readonly providers: Readonly<Record<string, readonly string[]>>;
}

// The single transcription of Appendix A.1. Every event and provider lookup
// below is derived from this table.
export const HOOK_EVENT_TABLE: readonly HookEventRow[] = [
  {
    canonical: "before_tool_execute",
    providers: {
      "claude-code": ["PreToolUse"],
      "gemini-cli": ["BeforeTool"],
      "copilot-cli": ["preToolUse"],
      "kiro": ["preToolUse"],
      "cursor": ["preToolUse"],
      "devin": ["PreToolUse"],
      "opencode": ["tool.execute.before"],
      "vs-code-copilot": ["PreToolUse"],
      "factory-droid": ["PreToolUse"],
      "pi": ["tool_call"],
    },
  },
  {
    canonical: "after_tool_execute",
    providers: {
      "claude-code": ["PostToolUse"],
      "gemini-cli": ["AfterTool"],
      "copilot-cli": ["postToolUse"],
      "kiro": ["postToolUse"],
      "cursor": ["postToolUse"],
      "devin": ["PostToolUse"],
      "opencode": ["tool.execute.after"],
      "vs-code-copilot": ["PostToolUse"],
      "factory-droid": ["PostToolUse"],
      "pi": ["tool_result"],
    },
  },
  {
    canonical: "before_shell_execute",
    providers: {
      "cursor": ["beforeShellExecution"],
      "devin": ["pre_run_command"],
    },
  },
  {
    canonical: "after_shell_execute",
    providers: {
      "cursor": ["afterShellExecution"],
      "devin": ["post_run_command"],
    },
  },
  {
    canonical: "before_mcp_execute",
    providers: {
      "cursor": ["beforeMCPExecution"],
      "devin": ["pre_mcp_tool_use"],
    },
  },
  {
    canonical: "after_mcp_execute",
    providers: {
      "cursor": ["afterMCPExecution"],
      "devin": ["post_mcp_tool_use"],
    },
  },
  {
    canonical: "before_file_read",
    providers: {
      "cursor": ["beforeReadFile"],
      "devin": ["pre_read_code"],
    },
  },
  {
    canonical: "before_prompt",
    providers: {
      "claude-code": ["UserPromptSubmit"],
      "gemini-cli": ["BeforeAgent"],
      "copilot-cli": ["userPromptSubmitted"],
      "kiro": ["userPromptSubmit"],
      "cursor": ["beforeSubmitPrompt"],
      "devin": ["UserPromptSubmit", "pre_user_prompt"],
      "vs-code-copilot": ["UserPromptSubmit"],
      "factory-droid": ["UserPromptSubmit"],
      "pi": ["input"],
    },
  },
  {
    canonical: "agent_stop",
    providers: {
      "claude-code": ["Stop"],
      "gemini-cli": ["AfterAgent"],
      "kiro": ["stop"],
      "copilot-cli": ["agentStop"],
      "cursor": ["stop"],
      "devin": ["Stop", "post_cascade_response"],
      "opencode": ["session.idle"],
      "vs-code-copilot": ["Stop"],
      "factory-droid": ["Stop"],
      "pi": ["agent_end"],
    },
  },
  {
    canonical: "session_start",
    providers: {
      "claude-code": ["SessionStart"],
      "gemini-cli": ["SessionStart"],
      "copilot-cli": ["sessionStart"],
      "kiro": ["agentSpawn"],
      "cursor": ["sessionStart"],
      "devin": ["SessionStart", "session_start"],
      "opencode": ["session.created"],
      "vs-code-copilot": ["SessionStart"],
      "factory-droid": ["SessionStart"],
      "pi": ["session_start"],
    },
  },
  {
    canonical: "session_end",
    providers: {
      "claude-code": ["SessionEnd"],
      "gemini-cli": ["SessionEnd"],
      "copilot-cli": ["sessionEnd"],
      "cursor": ["sessionEnd"],
      "devin": ["SessionEnd", "session_end"],
      "factory-droid": ["SessionEnd"],
      "pi": ["session_shutdown"],
    },
  },
  {
    canonical: "before_compact",
    providers: {
      "claude-code": ["PreCompact"],
      "gemini-cli": ["PreCompress"],
      "cursor": ["preCompact"],
      "vs-code-copilot": ["PreCompact"],
      "factory-droid": ["PreCompact"],
      "pi": ["session_before_compact"],
    },
  },
  {
    canonical: "notification",
    providers: {
      "claude-code": ["Notification"],
      "gemini-cli": ["Notification"],
      "factory-droid": ["Notification"],
    },
  },
  {
    canonical: "subagent_start",
    providers: {
      "claude-code": ["SubagentStart"],
      "cursor": ["subagentStart"],
      "vs-code-copilot": ["SubagentStart"],
      "pi": ["before_agent_start"],
    },
  },
  {
    canonical: "subagent_stop",
    providers: {
      "claude-code": ["SubagentStop"],
      "copilot-cli": ["subagentStop"],
      "cursor": ["subagentStop"],
      "vs-code-copilot": ["SubagentStop"],
      "factory-droid": ["SubagentStop"],
    },
  },
  {
    canonical: "error_occurred",
    providers: {
      "claude-code": ["ErrorOccurred"],
      "copilot-cli": ["errorOccurred"],
      "opencode": ["session.error"],
    },
  },
  {
    canonical: "tool_use_failure",
    providers: {
      "claude-code": ["PostToolUseFailure"],
      "cursor": ["postToolUseFailure"],
      "copilot-cli": ["errorOccurred"],
    },
  },
  {
    canonical: "permission_request",
    providers: {
      "claude-code": ["PermissionRequest"],
      "devin": ["PermissionRequest"],
      "opencode": ["permission.asked"],
    },
  },
  {
    canonical: "after_compact",
    providers: {
      "claude-code": ["PostCompact"],
      "devin": ["PostCompaction"],
    },
  },
  {
    canonical: "instructions_loaded",
    providers: {
      "claude-code": ["InstructionsLoaded"],
    },
  },
  {
    canonical: "config_change",
    providers: {
      "claude-code": ["ConfigChange"],
    },
  },
  {
    canonical: "worktree_create",
    providers: {
      "claude-code": ["WorktreeCreate"],
      "devin": ["post_setup_worktree"],
    },
  },
  {
    canonical: "worktree_remove",
    providers: {
      "claude-code": ["WorktreeRemove"],
    },
  },
  {
    canonical: "elicitation",
    providers: {
      "claude-code": ["Elicitation"],
    },
  },
  {
    canonical: "elicitation_result",
    providers: {
      "claude-code": ["ElicitationResult"],
    },
  },
  {
    canonical: "teammate_idle",
    providers: {
      "claude-code": ["TeammateIdle"],
    },
  },
  {
    canonical: "task_completed",
    providers: {
      "claude-code": ["TaskCompleted"],
    },
  },
  {
    canonical: "stop_failure",
    providers: {
      "claude-code": ["StopFailure"],
    },
  },
  {
    canonical: "before_model",
    providers: {
      "gemini-cli": ["BeforeModel"],
    },
  },
  {
    canonical: "after_model",
    providers: {
      "gemini-cli": ["AfterModel"],
      "cursor": ["afterAgentResponse"],
    },
  },
  {
    canonical: "before_tool_selection",
    providers: {
      "gemini-cli": ["BeforeToolSelection"],
    },
  },
  {
    canonical: "file_changed",
    providers: {
      "claude-code": ["FileChanged"],
      "cursor": ["afterFileEdit"],
      "devin": ["post_write_code"],
      "kiro": ["File Save"],
      "opencode": ["file.edited"],
    },
  },
  {
    canonical: "file_created",
    providers: {
      "kiro": ["File Create"],
    },
  },
  {
    canonical: "file_deleted",
    providers: {
      "kiro": ["File Delete"],
    },
  },
  {
    canonical: "before_task",
    providers: {
      "kiro": ["Pre Task Execution"],
    },
  },
  {
    canonical: "after_task",
    providers: {
      "kiro": ["Post Task Execution"],
    },
  },
  {
    canonical: "transcript_export",
    providers: {
      "devin": ["post_cascade_response_with_transcript"],
    },
  },
  {
    canonical: "turn_start",
    providers: {
      "pi": ["turn_start"],
    },
  },
  {
    canonical: "turn_end",
    providers: {
      "pi": ["turn_end"],
    },
  },
  {
    canonical: "model_select",
    providers: {
      "pi": ["model_select"],
    },
  },
  {
    canonical: "user_bash",
    providers: {
      "pi": ["user_bash"],
    },
  },
  {
    canonical: "context_update",
    providers: {
      "pi": ["context"],
    },
  },
  {
    canonical: "message_start",
    providers: {
      "pi": ["message_start"],
    },
  },
  {
    canonical: "message_end",
    providers: {
      "pi": ["message_end"],
    },
  },
];

export const CANONICAL_EVENTS = new Set(HOOK_EVENT_TABLE.map(({ canonical }) => canonical));

const nativeEventMappings = Object.create(null) as Record<string, string[]>;
const hookEventProviders = new Set<string>();
for (const row of HOOK_EVENT_TABLE) {
  for (const [provider, nativeNames] of Object.entries(row.providers)) {
    hookEventProviders.add(provider);
    for (const nativeName of nativeNames) {
      const canonicalNames = nativeEventMappings[nativeName] ??= [];
      if (!canonicalNames.includes(row.canonical)) {
        canonicalNames.push(row.canonical);
      }
    }
  }
}

// Derived views of A.1; these are not independently maintained mappings.
export const PROVIDER_EVENT_MAPPINGS: Readonly<Record<string, readonly string[]>> = nativeEventMappings;
export const HOOK_EVENT_PROVIDERS: ReadonlySet<string> = hookEventProviders;

const HOOK_EVENT_ROWS_BY_CANONICAL = new Map(
  HOOK_EVENT_TABLE.map((row) => [row.canonical, row] as const),
);

export function getHookEventNativeNames(canonicalEvent: string, provider: string): readonly string[] | undefined {
  return HOOK_EVENT_ROWS_BY_CANONICAL.get(canonicalEvent)?.providers[provider];
}

export function translateEventName(event: unknown): string {
  if (typeof event !== "string") {
    throw new AcifBodyHashError(
      "acif.hook.event_unrecognized",
      `The event name must be a string. Received: ${typeof event}. Remedy: Please provide a valid string for the 'event' field.`,
    );
  }

  // 1. Matched by exact byte comparison to canonical vocabulary
  if (CANONICAL_EVENTS.has(event)) {
    return event;
  }

  // 2. Translate provider-native event names
  const canonicalCandidates = PROVIDER_EVENT_MAPPINGS[event];
  if (canonicalCandidates !== undefined && canonicalCandidates.length > 0) {
    if (canonicalCandidates.length === 1) {
      return canonicalCandidates[0];
    }
    // Apply Appendix A.3 reverse-translation tiebreaker:
    // copilot-cli maps BOTH error_occurred and tool_use_failure to errorOccurred; reverse translation MUST prefer error_occurred.
    if (event === "errorOccurred") {
      return "error_occurred";
    }
    // For any other multi-match, the lexicographically smaller canonical name wins
    const sorted = [...canonicalCandidates].sort();
    return sorted[0];
  }

  // 3. Reject unrecognized with fix-forward detail text
  throw new AcifBodyHashError(
    "acif.hook.event_unrecognized",
    `The event name '${event}' is not recognized. Remedy: Please use a canonical event name from Appendix A (e.g., 'before_tool_execute') or a recognized provider-native name (e.g., 'PreToolUse').`,
  );
}

export function validateReferencedPath(path: string): string {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\")
  ) {
    throw new AcifBodyHashError(
      "acif.hook.script_path_invalid",
      `The path '${path}' is invalid. Remedy: Please use a relative POSIX-style path (e.g., 'hooks/my-script') without backslashes, absolute roots, or UNC prefixes.`,
      { path },
    );
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === ".." || segment === "")) {
    throw new AcifBodyHashError(
      "acif.hook.script_path_invalid",
      `The path '${path}' is invalid because it contains empty segments or traversing/current-directory segments ('.' or '..'). Remedy: Please write standard, relative child-level file paths.`,
      { path },
    );
  }
  return path;
}

export function normalizeInlineContent(content: string): string {
  let normalized = content;
  if (normalized.startsWith("\uFEFF")) {
    normalized = normalized.slice(1);
  }
  // Normalize CRLF to LF, and then lone CR to LF
  return normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export const CANONICAL_TOOLS = new Set([
  "file_read",
  "file_write",
  "file_edit",
  "shell",
  "find",
  "search",
  "web_search",
  "agent",
  "web_fetch",
  "list",
  "notebook_edit",
  "multi_edit",
  "list_dir",
  "notebook_read",
  "kill_shell",
  "skill",
  "ask_user"
]);

export const NATIVE_TOOL_MAPPINGS: Record<string, string> = {
  // file_read
  "Read": "file_read",
  "read_file": "file_read",
  "view": "file_read",
  "read": "file_read",
  "view_line_range": "file_read",
  // file_write
  "Write": "file_write",
  "write_file": "file_write",
  "create": "file_write",
  "write": "file_write",
  "write_to_file": "file_write",
  "Create": "file_write",
  // file_edit
  "Edit": "file_edit",
  "replace": "file_edit",
  "edit": "file_edit",
  "fs_write": "file_edit",      // preferred over file_write
  "edit_file": "file_edit",     // preferred over file_write
  "replace_in_file": "file_edit",
  "apply_patch": "file_edit",   // preferred over file_write
  // shell
  "Bash": "shell",
  "run_shell_command": "shell",
  "bash": "shell",
  "shell": "shell",
  "terminal": "shell",
  "execute_command": "shell",
  "run_terminal_cmd": "shell",
  "run_command": "shell",
  "Execute": "shell",
  // find
  "Glob": "find",
  "glob": "find",
  "find_path": "find",
  "list_files": "find",
  "file_search": "find",
  "find_by_name": "find",
  "list_dir": "find",
  "find": "find",
  // search
  "Grep": "search",
  "grep_search": "search",
  "grep": "search",
  "search_files": "search",
  "grep_files": "search",
  // web_search
  "WebSearch": "web_search",
  "google_web_search": "web_search",
  "websearch": "web_search",
  "web_search": "web_search",
  "search_web": "web_search",
  // agent
  "Agent": "agent",
  "task": "agent",
  "spawn_agent": "agent",
  "use_subagent": "agent",
  "Task": "agent",
  // web_fetch
  "WebFetch": "web_fetch",
  "web_fetch": "web_fetch",
  "webfetch": "web_fetch",
  "fetch": "web_fetch",
  "read_url_content": "web_fetch",
  "FetchUrl": "web_fetch",
  // list
  "ls": "list",
  // notebook_edit
  "NotebookEdit": "notebook_edit",
  // multi_edit
  "MultiEdit": "multi_edit",
  // list_dir
  "LS": "list_dir",
  // notebook_read
  "NotebookRead": "notebook_read",
  // kill_shell
  "KillBash": "kill_shell",
  // skill
  "Skill": "skill",
  // ask_user
  "AskUserQuestion": "ask_user"
};

export function translateToolName(toolName: string): string {
  if (CANONICAL_TOOLS.has(toolName)) {
    return toolName;
  }
  if (toolName.toLowerCase() === "task") {
    return "agent";
  }
  return NATIVE_TOOL_MAPPINGS[toolName] ?? toolName;
}

export function translateMatcher(matcher: string): string {
  const components = matcher.split("|");
  const translated = components.map((comp) => {
    if (comp === ".*" || comp === "*") {
      return comp;
    }
    if (comp.includes("__") || comp.includes("/") || comp.includes(":")) {
      return comp;
    }
    if (comp.endsWith(".*")) {
      const base = comp.slice(0, -2);
      return translateToolName(base) + ".*";
    }
    return translateToolName(comp);
  });
  return translated.join("|");
}

// ACIF-HOOK §6.2: these matchers filter command/server/file-read values, not
// tool names, so they bypass ACIF-CORE Appendix A.3 byte for byte.
export const MATCHER_PASSTHROUGH_EVENTS: ReadonlySet<string> = new Set([
  "before_shell_execute",
  "after_shell_execute",
  "before_mcp_execute",
  "after_mcp_execute",
  "before_file_read",
]);

export function canonicalizeHook(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Expected plain object for hook extension block");
  }

  const hook = input as Record<string, unknown>;

  // event validation & translation
  const eventVal = "event" in hook ? hook.event : undefined;
  const canonicalEvent = translateEventName(eventVal);

  const output: Record<string, unknown> = {
    ...hook,
    event: canonicalEvent,
  };

  // matcher non-emptiness & canonicalization (2. do NOT trim, drop only when exactly empty string)
  if ("matcher" in hook) {
    const matcherVal = hook.matcher;
    if (matcherVal !== undefined && matcherVal !== null) {
      if (typeof matcherVal !== "string") {
        throw new Error("Matcher must be a string");
      }
      if (matcherVal === "") {
        delete output.matcher;
      } else {
        output.matcher = MATCHER_PASSTHROUGH_EVENTS.has(canonicalEvent)
          ? matcherVal
          : translateMatcher(matcherVal);
      }
    } else {
      delete output.matcher;
    }
  }

  // handlers presence (3. acif.hook.handlers_missing is pinned to exactly 'handlers absent or empty')
  const handlers = hook.handlers;
  if (!Array.isArray(handlers) || handlers.length === 0) {
    throw new AcifBodyHashError(
      "acif.hook.handlers_missing",
      "The 'handlers' array is required and must not be empty. Remedy: Please specify one or more handlers in the 'handlers' array field.",
    );
  }

  // blocking (4. must be boolean when present, throw plain Error if not)
  if ("blocking" in hook) {
    const blockingVal = hook.blocking;
    if (typeof blockingVal !== "boolean") {
      throw new Error("The 'blocking' field must be a boolean when present.");
    }
    output.blocking = blockingVal;
  } else {
    output.blocking = false;
  }

  // auxiliary_files (5. keep source order and duplicates, validate but do not NFC-normalize)
  if ("auxiliary_files" in hook) {
    const auxFiles = hook.auxiliary_files;
    if (Array.isArray(auxFiles)) {
      output.auxiliary_files = auxFiles.map((file) => {
        if (typeof file !== "object" || file === null || Array.isArray(file)) {
          throw new Error("Expected auxiliary file entry to be a plain object");
        }
        const fileObj = file as Record<string, unknown>;
        if (typeof fileObj.path !== "string") {
          throw new Error("Auxiliary file entry must have a string 'path' field");
        }
        // Validate but do not NFC-normalize
        validateReferencedPath(fileObj.path);
        return {
          ...fileObj,
        };
      });
    } else if (auxFiles !== undefined && auxFiles !== null) {
      throw new Error("The 'auxiliary_files' field must be an array when present.");
    }
  }

  // requires validation (§6.2, §10)
  if ("requires" in hook) {
    const requiresVal = hook.requires;
    if (requiresVal !== undefined && requiresVal !== null) {
      if (typeof requiresVal !== "object" || Array.isArray(requiresVal)) {
        throw new TypeError("requires must be a parsed JSON object when present");
      }
      const keys = Object.keys(requiresVal);
      if (keys.length > 0) {
        // Reject with acif.requires.orphan_key for any keys present in requires
        throw new AcifBodyHashError(
          "acif.requires.orphan_key",
          `The key '${keys[0]}' in 'requires' is non-conformant for hooks. The recognized 'requires' vocabulary for hooks is empty in ACIF 0.1. Remedy: Please omit or empty the 'requires' block.`,
          { key: keys[0] }
        );
      }
      delete output.requires;
    } else {
      delete output.requires;
    }
  }

  // activation_target validation (§6.2)
  if ("activation_target" in hook) {
    const actTarget = hook.activation_target;
    if (actTarget !== undefined && actTarget !== null) {
      if (typeof actTarget !== "object" || Array.isArray(actTarget)) {
        throw new Error("activation_target must be a plain object");
      }
      const actObj = actTarget as Record<string, unknown>;
      if (!("skill" in actObj) || typeof actObj.skill !== "object" || actObj.skill === null || Array.isArray(actObj.skill)) {
        throw new Error("activation_target.skill must be a plain object");
      }
      const skillObj = actObj.skill as Record<string, unknown>;
      if (!("id" in skillObj) || typeof skillObj.id !== "string" || skillObj.id.trim() === "") {
        throw new Error("activation_target.skill.id is required and must be a non-empty string");
      }
      // Keep activation_target (and any extra fields as passthrough)
      output.activation_target = {
        ...actObj,
        skill: {
          ...skillObj,
        },
      };
    } else {
      delete output.activation_target;
    }
  }

  // handlers validation and order preservation
  output.handlers = handlers.map((handler, index) => {
    if (typeof handler !== "object" || handler === null || Array.isArray(handler)) {
      throw new Error(`Expected handler at index ${index} to be a plain object`);
    }
    const handlerObj = handler as Record<string, unknown>;

    // handler-type materialization (§8.2) & validation:
    let typeVal = handlerObj.type;
    if (typeVal === undefined || typeVal === null || typeVal === "") {
      typeVal = "command";
    }

    if (typeof typeVal !== "string") {
      throw new AcifBodyHashError(
        "acif.hook.handler_type_unrecognized",
        `Handler type must be a string. Received: ${typeof typeVal} at index ${index}. Remedy: Please specify a valid string type.`,
        { handler: index, type: typeVal }
      );
    }

    if (typeVal !== "command" && typeVal !== "http" && typeVal !== "prompt" && typeVal !== "agent") {
      throw new AcifBodyHashError(
        "acif.hook.handler_type_unrecognized",
        `The handler type '${typeVal}' is not recognized. Remedy: Please use one of the canonical handler types: 'command', 'http', 'prompt', or 'agent'.`,
        { handler: index, type: typeVal }
      );
    }

    const canonicalHandler: Record<string, unknown> = {
      ...handlerObj,
      type: typeVal,
    };

    // scripts placement rules (§6.2):
    if (typeVal === "command") {
      // REQUIRED for type: command (3. throw a plain Error on missing/empty scripts)
      const scripts = handlerObj.scripts;
      if (!Array.isArray(scripts) || scripts.length === 0) {
        throw new Error(
          `The 'scripts' field is required and must be a non-empty array for handler of type 'command' at index ${index}.`,
        );
      }

      // validate scripts shape
      canonicalHandler.scripts = scripts.map((script, scriptIndex) => {
        if (typeof script !== "object" || script === null || Array.isArray(script)) {
          throw new Error(`Expected script at index ${scriptIndex} under handler ${index} to be a plain object`);
        }
        const scriptObj = script as Record<string, unknown>;
        const scriptType = scriptObj.type;
        if (scriptType !== "file" && scriptType !== "inline") {
          throw new Error(`Script entry at index ${scriptIndex} under handler ${index} must have type 'file' or 'inline'.`);
        }

        const canonicalScript: Record<string, unknown> = {
          ...scriptObj,
        };

        if (scriptType === "file") {
          if (typeof scriptObj.path !== "string" || scriptObj.path.trim() === "") {
            throw new Error(`Script entry of type 'file' must have a non-empty string 'path' field.`);
          }
          // Validate but do not NFC-normalize
          validateReferencedPath(scriptObj.path);
        } else if (scriptType === "inline") {
          if (typeof scriptObj.content !== "string") {
            throw new Error(`Script entry of type 'inline' must have a string 'content' field.`);
          }
          // inline content normalization per §9.3
          canonicalScript.content = normalizeInlineContent(scriptObj.content);
        }

        return canonicalScript;
      });

      // async (4. must be boolean when present, throw plain Error if not)
      if ("async" in handlerObj) {
        const asyncVal = handlerObj.async;
        if (typeof asyncVal !== "boolean") {
          throw new Error(`The 'async' field must be a boolean when present (handler ${index}).`);
        }
        canonicalHandler.async = asyncVal;
      } else {
        canonicalHandler.async = false;
      }
    } else {
      // scripts MUST NOT appear on other handler types (§6.2) (3. throw a plain Error)
      if ("scripts" in handlerObj) {
        throw new Error(
          `The 'scripts' field must not appear on handler of type '${typeVal}' at index ${index}.`,
        );
      }
    }

    return canonicalHandler;
  });

  return output;
}
