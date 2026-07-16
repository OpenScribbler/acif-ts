import { AcifBodyHashError } from "./body_hash";

// Canonical events from Appendix A.1 of ACIF-HOOK
export const CANONICAL_EVENTS = new Set([
  "before_tool_execute",
  "after_tool_execute",
  "before_prompt",
  "agent_stop",
  "session_start",
  "session_end",
  "before_compact",
  "notification",
  "subagent_start",
  "subagent_stop",
  "error_occurred",
  "tool_use_failure",
  "permission_request",
  "after_compact",
  "instructions_loaded",
  "config_change",
  "worktree_create",
  "worktree_remove",
  "elicitation",
  "elicitation_result",
  "teammate_idle",
  "task_completed",
  "stop_failure",
  "before_model",
  "after_model",
  "before_tool_selection",
  "file_changed",
  "file_created",
  "file_deleted",
  "before_task",
  "after_task",
  "transcript_export",
  "turn_start",
  "turn_end",
  "model_select",
  "user_bash",
  "context_update",
  "message_start",
  "message_end",
]);

// Provider-native to canonical event mappings from Appendix A.1
export const PROVIDER_EVENT_MAPPINGS: Record<string, string[]> = {
  // before_tool_execute
  "PreToolUse": ["before_tool_execute"],
  "BeforeTool": ["before_tool_execute"],
  "preToolUse": ["before_tool_execute"],
  "tool.execute.before": ["before_tool_execute"],
  "tool_call": ["before_tool_execute"],
  // after_tool_execute
  "PostToolUse": ["after_tool_execute"],
  "AfterTool": ["after_tool_execute"],
  "postToolUse": ["after_tool_execute"],
  "tool.execute.after": ["after_tool_execute"],
  "tool_result": ["after_tool_execute"],
  // before_prompt
  "UserPromptSubmit": ["before_prompt"],
  "BeforeAgent": ["before_prompt"],
  "userPromptSubmitted": ["before_prompt"],
  "userPromptSubmit": ["before_prompt"],
  "pre_user_prompt": ["before_prompt"],
  "input": ["before_prompt"],
  // agent_stop
  "Stop": ["agent_stop"],
  "AfterAgent": ["agent_stop"],
  "stop": ["agent_stop"],
  "agentStop": ["agent_stop"],
  "post_cascade_response": ["agent_stop"],
  "session.idle": ["agent_stop"],
  "agent_end": ["agent_stop"],
  // session_start
  "SessionStart": ["session_start"],
  "agentSpawn": ["session_start"],
  "session_start": ["session_start"],
  "session.created": ["session_start"],
  "sessionStart": ["session_start"], // 1. Appendix A.1 transcription gap: sessionStart -> session_start
  // session_end
  "SessionEnd": ["session_end"],
  "sessionEnd": ["session_end"],
  "session_end": ["session_end"],
  "session_shutdown": ["session_end"],
  // before_compact
  "PreCompact": ["before_compact"],
  "PreCompress": ["before_compact"],
  "session_before_compact": ["before_compact"],
  // notification
  "Notification": ["notification"],
  // subagent_start
  "SubagentStart": ["subagent_start"],
  "before_agent_start": ["subagent_start"],
  // subagent_stop
  "SubagentStop": ["subagent_stop"],
  "subagentStop": ["subagent_stop"],
  // error_occurred
  "ErrorOccurred": ["error_occurred"],
  "errorOccurred": ["error_occurred", "tool_use_failure"], // maps to both
  "session.error": ["error_occurred"],
  // tool_use_failure
  "PostToolUseFailure": ["tool_use_failure"],
  "postToolUseFailure": ["tool_use_failure"],
  // permission_request
  "PermissionRequest": ["permission_request"],
  "permission.asked": ["permission_request"],
  // after_compact
  "PostCompact": ["after_compact"],
  // instructions_loaded
  "InstructionsLoaded": ["instructions_loaded"],
  // config_change
  "ConfigChange": ["config_change"],
  // worktree_create
  "WorktreeCreate": ["worktree_create"],
  "post_setup_worktree": ["worktree_create"],
  // worktree_remove
  "WorktreeRemove": ["worktree_remove"],
  // elicitation
  "Elicitation": ["elicitation"],
  // elicitation_result
  "ElicitationResult": ["elicitation_result"],
  // teammate_idle
  "TeammateIdle": ["teammate_idle"],
  // task_completed
  "TaskCompleted": ["task_completed"],
  // stop_failure
  "StopFailure": ["stop_failure"],
  // before_model
  "BeforeModel": ["before_model"],
  "beforeAgentResponse": ["before_model"],
  // after_model
  "AfterModel": ["after_model"],
  "afterAgentResponse": ["after_model"],
  // before_tool_selection
  "BeforeToolSelection": ["before_tool_selection"],
  "beforeToolSelection": ["before_tool_selection"],
  // file_changed
  "FileChanged": ["file_changed"],
  "afterFileEdit": ["file_changed"],
  "File Save": ["file_changed"],
  "file.edited": ["file_changed"],
  // file_created
  "File Create": ["file_created"],
  // file_deleted
  "File Delete": ["file_deleted"],
  // before_task
  "Pre Task Execution": ["before_task"],
  // after_task
  "Post Task Execution": ["after_task"],
  // transcript_export
  "post_cascade_response_with_transcript": ["transcript_export"],
  // turn_start
  "turn_start": ["turn_start"],
  // turn_end
  "turn_end": ["turn_end"],
  // model_select
  "model_select": ["model_select"],
  // user_bash
  "user_bash": ["user_bash"],
  // context_update
  "context": ["context_update"],
  // message_start
  "message_start": ["message_start"],
  // message_end
  "message_end": ["message_end"],
};

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
        output.matcher = translateMatcher(matcherVal);
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
