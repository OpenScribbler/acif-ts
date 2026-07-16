import { describe, expect, it } from "vitest";
import { renderHookBlock } from "../src/hook_render";

describe("hook render-back", () => {
  it("translates canonical event names to provider-native event names", () => {
    const hook = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [{ path: "scripts/run.sh" }]
        }
      ]
    };

    // Render to claude-code
    const result1 = renderHookBlock(hook, "claude-code");
    const parsed1 = JSON.parse(result1.output);
    expect(parsed1.event).toBe("PreToolUse");

    // Render to gemini-cli
    const result2 = renderHookBlock(hook, "gemini-cli");
    const parsed2 = JSON.parse(result2.output);
    expect(parsed2.event).toBe("BeforeTool");

    // Render to unknown target (emits verbatim)
    const result3 = renderHookBlock(hook, "unknown-provider");
    const parsed3 = JSON.parse(result3.output);
    expect(parsed3.event).toBe("before_tool_execute");
  });

  it("losslessly renders to per-os-key-map provider", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] },
            { path: "scripts/mac.sh", os: ["darwin"] },
            { path: "scripts/default.sh" }
          ]
        }
      ]
    };

    const result = renderHookBlock(hook, "per-os-key-map");
    const parsed = JSON.parse(result.output);

    expect(parsed.handlers).toHaveLength(1);
    const handler = parsed.handlers[0];
    expect(handler.type).toBe("command");
    expect(handler.windows).toBe("scripts/win.bat");
    expect(handler.osx).toBe("scripts/mac.sh");
    expect(handler.command).toBe("scripts/default.sh");
    expect(handler.scripts).toBeUndefined();
  });

  it("degrades to no-mechanism provider when default entry exists", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] },
            { path: "scripts/default.sh" }
          ]
        }
      ]
    };

    const result = renderHookBlock(hook, "claude-code");
    const parsed = JSON.parse(result.output);

    expect(parsed.handlers).toHaveLength(1);
    const handler = parsed.handlers[0];
    expect(handler.scripts).toEqual([{ path: "scripts/default.sh" }]);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe("acif.hook.platform_override_dropped");
  });

  it("degrades to no-mechanism provider when all-constrained and target OS is specified", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] },
            { path: "scripts/mac.sh", os: ["darwin"] }
          ]
        }
      ]
    };

    // Render for darwin
    const result1 = renderHookBlock(hook, "claude-code", "darwin");
    const parsed1 = JSON.parse(result1.output);
    expect(parsed1.handlers[0].scripts).toEqual([{ path: "scripts/mac.sh", os: ["darwin"] }]);
    expect(result1.diagnostics).toHaveLength(1);
    expect(result1.diagnostics[0].id).toBe("acif.hook.platform_override_dropped");
  });

  it("refuses to render when all-constrained and target OS is unspecified", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] },
            { path: "scripts/mac.sh", os: ["darwin"] }
          ]
        }
      ]
    };

    expect(() => renderHookBlock(hook, "claude-code")).toThrowError(/Refusing to render/);
  });

  it("refuses to render when all-constrained and target OS has no match", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] }
          ]
        }
      ]
    };

    expect(() => renderHookBlock(hook, "claude-code", "linux")).toThrowError(/Refusing to render/);
  });
});
