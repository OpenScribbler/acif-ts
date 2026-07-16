import { describe, expect, it } from "vitest";
import { canonicalizeHook, translateEventName, normalizeInlineContent, validateReferencedPath, translateMatcher } from "../src/hook";
import { AcifBodyHashError } from "../src/body_hash";

function expectAcifError(fn: () => unknown, id: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AcifBodyHashError);
    expect((error as AcifBodyHashError).id).toBe(id);
    expect((error as AcifBodyHashError).code).toBe(id);
    return;
  }
  throw new Error(`Expected ${id}`);
}

function expectPlainError(fn: () => unknown, messageSubstring?: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AcifBodyHashError);
    if (messageSubstring) {
      expect((error as Error).message).toContain(messageSubstring);
    }
    return;
  }
  throw new Error("Expected plain Error");
}

describe("canonicalizeHook event translation", () => {
  it("keeps canonical event names as is", () => {
    expect(translateEventName("before_tool_execute")).toBe("before_tool_execute");
    expect(translateEventName("session_start")).toBe("session_start");
  });

  it("translates recognized provider-native event names to canonical form", () => {
    expect(translateEventName("PreToolUse")).toBe("before_tool_execute");
    expect(translateEventName("BeforeTool")).toBe("before_tool_execute");
    expect(translateEventName("UserPromptSubmit")).toBe("before_prompt");
    expect(translateEventName("BeforeAgent")).toBe("before_prompt");
  });

  it("handles Appendix A.1 transcription gap: sessionStart -> session_start", () => {
    expect(translateEventName("sessionStart")).toBe("session_start");
  });

  it("handles Appendix A.3 tiebreaker for errorOccurred", () => {
    expect(translateEventName("errorOccurred")).toBe("error_occurred");
  });

  it("rejects unrecognized event names with acif.hook.event_unrecognized", () => {
    expectAcifError(() => translateEventName("non_existent_event"), "acif.hook.event_unrecognized");
    expectAcifError(() => translateEventName(123), "acif.hook.event_unrecognized");
  });
});

describe("canonicalizeHook matcher translation", () => {
  it("translates provider-native tool names to canonical tool names per Appendix A.3", () => {
    expect(translateMatcher("Read|Write")).toBe("file_read|file_write");
    expect(translateMatcher("Read.*|glob")).toBe("file_read.*|find");
    expect(translateMatcher("Bash|Grep|WebSearch")).toBe("shell|search|web_search");
    expect(translateMatcher("Task")).toBe("agent");
    expect(translateMatcher("task.*")).toBe("agent.*");
  });

  it("passes bare wildcards untranslated", () => {
    expect(translateMatcher("*")).toBe("*");
    expect(translateMatcher(".*")).toBe(".*");
  });

  it("passes components containing __, /, or : untranslated", () => {
    expect(translateMatcher("mcp__server__tool")).toBe("mcp__server__tool");
    expect(translateMatcher("server/tool.*")).toBe("server/tool.*");
    expect(translateMatcher("mcp:server:tool")).toBe("mcp:server:tool");
  });

  it("leaves unrecognized components byte-verbatim", () => {
    expect(translateMatcher("SomeUnknownTool|Read")).toBe("SomeUnknownTool|file_read");
  });
});

describe("canonicalizeHook path validation", () => {
  it("accepts relative child paths and keeps them exactly as written", () => {
    expect(validateReferencedPath("hooks/my-script.sh")).toBe("hooks/my-script.sh");
  });

  it("rejects absolute paths with acif.hook.script_path_invalid", () => {
    expectAcifError(() => validateReferencedPath("/etc/hooks/run.sh"), "acif.hook.script_path_invalid");
  });

  it("rejects traversing paths with acif.hook.script_path_invalid", () => {
    expectAcifError(() => validateReferencedPath("hooks/../run.sh"), "acif.hook.script_path_invalid");
    expectAcifError(() => validateReferencedPath("../run.sh"), "acif.hook.script_path_invalid");
  });

  it("rejects non-POSIX paths or backslashes with acif.hook.script_path_invalid", () => {
    expectAcifError(() => validateReferencedPath("hooks\\run.cmd"), "acif.hook.script_path_invalid");
    expectAcifError(() => validateReferencedPath("C:/hooks/run.cmd"), "acif.hook.script_path_invalid");
    expectAcifError(() => validateReferencedPath("\\\\network\\share"), "acif.hook.script_path_invalid");
  });
});

describe("canonicalizeHook inline content normalization", () => {
  it("normalizes CRLF and lone CR to LF and strips UTF-8 BOM", () => {
    expect(normalizeInlineContent("\uFEFF#!/bin/sh\r\necho hi\r")).toBe("#!/bin/sh\necho hi\n");
  });
});

describe("canonicalizeHook core validation", () => {
  it("happy-path: validates and canonicalizes a valid hook object with handler order preserved", () => {
    const raw = {
      event: "PreToolUse",
      matcher: "Read|Write",
      blocking: true,
      handlers: [
        {
          type: "command",
          scripts: [
            { type: "file", path: "hooks/check-write", os: ["darwin", "linux"] },
            { type: "inline", content: "echo ok", os: ["windows"] }
          ],
          async: true,
          opaque_field: "value1"
        },
        {
          scripts: [
            { type: "file", path: "hooks/notify" }
          ]
        }
      ],
      auxiliary_files: [
        { path: "hooks/helper.sh" },
        { path: "hooks/utils.sh" }
      ],
      activation_target: {
        skill: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "tdd-workflow"
        }
      },
      extra_global: "passthrough"
    };

    const result = canonicalizeHook(raw);

    // event was translated
    expect(result.event).toBe("before_tool_execute");
    expect(result.matcher).toBe("file_read|file_write");
    expect(result.blocking).toBe(true);
    expect(result.extra_global).toBe("passthrough");

    // handlers preserved
    expect(result.handlers).toBeInstanceOf(Array);
    const handlers = result.handlers as any[];
    expect(handlers.length).toBe(2);

    // first handler: command, async true, scripts validated
    expect(handlers[0].type).toBe("command");
    expect(handlers[0].async).toBe(true);
    expect(handlers[0].opaque_field).toBe("value1");
    expect(handlers[0].scripts[0].path).toBe("hooks/check-write");

    // second handler: materialized absent type to 'command', default async to false
    expect(handlers[1].type).toBe("command");
    expect(handlers[1].async).toBe(false);
    expect(handlers[1].scripts[0].path).toBe("hooks/notify");

    // auxiliary_files preserved exact source order and paths as written
    expect(result.auxiliary_files).toBeInstanceOf(Array);
    const aux = result.auxiliary_files as any[];
    expect(aux[0].path).toBe("hooks/helper.sh");
    expect(aux[1].path).toBe("hooks/utils.sh");

    // activation_target preserved
    expect(result.activation_target).toEqual({
      skill: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "tdd-workflow"
      }
    });
  });

  it("rejects empty handlers list with acif.hook.handlers_missing", () => {
    expectAcifError(
      () => canonicalizeHook({ event: "session_start", handlers: [] }),
      "acif.hook.handlers_missing"
    );
  });

  it("materializes absent type to command and default async to false", () => {
    const result = canonicalizeHook({
      event: "session_start",
      handlers: [{ scripts: [{ type: "file", path: "hooks/run.sh" }] }]
    });
    expect((result.handlers as any[])[0].type).toBe("command");
    expect((result.handlers as any[])[0].async).toBe(false);
  });

  it("rejects unrecognized handler type with acif.hook.handler_type_unrecognized", () => {
    expectAcifError(
      () => canonicalizeHook({
        event: "session_start",
        handlers: [{ type: "invalid_type", scripts: [{ type: "file", path: "hooks/run.sh" }] }]
      }),
      "acif.hook.handler_type_unrecognized"
    );
  });

  it("throws plain Error (not handlers_missing) on command handler with missing/empty scripts", () => {
    expectPlainError(
      () => canonicalizeHook({
        event: "session_start",
        handlers: [{ type: "command" }]
      }),
      "The 'scripts' field is required"
    );
  });

  it("throws plain Error (not handlers_missing) on non-command handler carrying scripts", () => {
    expectPlainError(
      () => canonicalizeHook({
        event: "session_start",
        handlers: [{ type: "http", url: "https://example.com", scripts: [{ type: "file", path: "hooks/run.sh" }] }]
      }),
      "The 'scripts' field must not appear on handler of type 'http'"
    );
  });

  it("throws plain Error on non-boolean blocking or async value", () => {
    expectPlainError(
      () => canonicalizeHook({
        event: "session_start",
        blocking: "true", // invalid type
        handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }]
      }),
      "blocking' field must be a boolean"
    );

    expectPlainError(
      () => canonicalizeHook({
        event: "session_start",
        handlers: [{
          type: "command",
          scripts: [{ type: "file", path: "hooks/run.sh" }],
          async: 1 // invalid type
        }]
      }),
      "async' field must be a boolean"
    );
  });

  it("rejects non-empty requires block with acif.requires.orphan_key", () => {
    expectAcifError(
      () => canonicalizeHook({
        event: "session_start",
        handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }],
        requires: { handler_types: true }
      }),
      "acif.requires.orphan_key"
    );
  });

  it("omits empty requires block from canonicalized output", () => {
    const result = canonicalizeHook({
      event: "session_start",
      handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }],
      requires: {}
    });
    expect("requires" in result).toBe(false);
  });

  it("omits only exactly empty matcher and does NOT trim matcher", () => {
    const resultEmpty = canonicalizeHook({
      event: "session_start",
      handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }],
      matcher: ""
    });
    expect("matcher" in resultEmpty).toBe(false);

    const resultSpaces = canonicalizeHook({
      event: "session_start",
      handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }],
      matcher: "   " // must preserve spaces exactly
    });
    expect(resultSpaces.matcher).toBe("   ");
  });

  it("keeps auxiliary_files source order, duplicates, and bytes verbatim", () => {
    const raw = {
      event: "session_start",
      handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }],
      auxiliary_files: [
        { path: "hooks/z.sh" },
        { path: "hooks/a.sh" },
        { path: "hooks/z.sh" } // duplicate
      ]
    };
    const result = canonicalizeHook(raw);
    expect(result.auxiliary_files).toBeInstanceOf(Array);
    const aux = result.auxiliary_files as any[];
    expect(aux.length).toBe(3);
    expect(aux[0].path).toBe("hooks/z.sh");
    expect(aux[1].path).toBe("hooks/a.sh");
    expect(aux[2].path).toBe("hooks/z.sh");
  });

  it("retains opaque passthrough fields", () => {
    const result = canonicalizeHook({
      event: "session_start",
      handlers: [{
        type: "command",
        scripts: [{ type: "file", path: "hooks/run.sh" }],
        timeout: 120,
        status_message: "Processing",
        custom_field: "preserved"
      }],
      custom_global: "preserved_too"
    });
    expect(result.custom_global).toBe("preserved_too");
    expect((result.handlers as any[])[0].custom_field).toBe("preserved");
    expect((result.handlers as any[])[0].timeout).toBe(120);
    expect((result.handlers as any[])[0].status_message).toBe("Processing");
  });
});
