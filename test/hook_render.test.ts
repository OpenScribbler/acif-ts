import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  HOOK_EVENT_RENDER_PINS,
  renderHookBlock,
  resolveHookEventRender,
} from "../src/hook_render";

interface SpecHookRenderPin {
  canonical: string;
  provider: string;
  target: string;
  fidelity: "lossless" | "degraded";
}

async function readSpecHookRenderPins(): Promise<SpecHookRenderPin[]> {
  const spec = new TextDecoder().decode(
    await readFile("spec-inputs/specs/hooks-interchange/spec.md"),
  );
  const sectionStart = spec.indexOf("### A.4 Render-back targets for multi-native providers");
  const sectionEnd = spec.indexOf("\nRender-back of a canonical event name", sectionStart);
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error("Could not locate ACIF-HOOK Appendix A.4 pin table");
  }

  const pins: SpecHookRenderPin[] = [];
  for (const line of spec.slice(sectionStart, sectionEnd).split("\n")) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*(lossless|degraded)/);
    if (!match) continue;
    pins.push({
      canonical: match[1],
      provider: match[2],
      target: match[3],
      fidelity: match[4] as "lossless" | "degraded",
    });
  }
  return pins;
}

function eventDiagnostic(event: string, provider: string) {
  return {
    id: "acif.hook.event_untranslatable",
    params: { event, provider },
  };
}

describe("hook render-back", () => {
  it("copies every A.4 pin and emits the pinned fidelity diagnostic", async () => {
    const specPins = await readSpecHookRenderPins();
    expect(specPins).toHaveLength(13);
    expect(HOOK_EVENT_RENDER_PINS).toEqual(specPins);

    for (const pin of specPins) {
      const result = renderHookBlock(
        { event: pin.canonical, handlers: [{ type: "http", url: "https://example.test" }] },
        pin.provider,
      );
      const parsed = JSON.parse(result.output);

      expect(parsed.event, `${pin.canonical} to ${pin.provider}`).toBe(pin.target);
      expect(result.diagnostics, `${pin.canonical} to ${pin.provider}`).toEqual(
        pin.fidelity === "degraded" ? [eventDiagnostic(pin.canonical, pin.provider)] : [],
      );
    }
  });

  describe("Appendix A.4 ordered render rules", () => {
    it("rule 1: a pin wins before A.1 names and emits only for degraded fidelity", () => {
      const pin = {
        canonical: "before_prompt",
        provider: "sample-provider",
        target: "PinnedName",
        fidelity: "lossless" as const,
      };

      expect(resolveHookEventRender("before_prompt", "sample-provider", {
        providerListedInA1: true,
        nativeNames: ["OtherName", "AnotherName"],
        pin,
      })).toEqual({ event: "PinnedName", diagnostics: [] });
      expect(resolveHookEventRender("before_prompt", "sample-provider", {
        providerListedInA1: true,
        nativeNames: ["OtherName"],
        pin: { ...pin, fidelity: "degraded" },
      })).toEqual({
        event: "PinnedName",
        diagnostics: [eventDiagnostic("before_prompt", "sample-provider")],
      });
    });

    it("rule 2: one A.1 native name is emitted without a diagnostic", () => {
      expect(resolveHookEventRender("before_shell_execute", "cursor", {
        providerListedInA1: true,
        nativeNames: ["beforeShellExecution"],
      })).toEqual({ event: "beforeShellExecution", diagnostics: [] });
    });

    it("rule 3: an unpinned multi-native pair keeps the canonical name and warns", () => {
      // No current A.1/A.4 pair reaches this rule; exercise it as the spec's
      // forward-compatibility behavior for a row amendment that lands first.
      expect(resolveHookEventRender("before_prompt", "devin", {
        providerListedInA1: true,
        nativeNames: ["UserPromptSubmit", "pre_user_prompt"],
      })).toEqual({
        event: "before_prompt",
        diagnostics: [eventDiagnostic("before_prompt", "devin")],
      });
    });

    it("rule 4: an A.1 provider with no native name keeps the canonical name and warns", () => {
      const result = renderHookBlock({
        event: "subagent_start",
        handlers: [{ type: "http", url: "https://example.test" }],
      }, "factory-droid");
      const parsed = JSON.parse(result.output);

      expect(parsed.event).toBe("subagent_start");
      expect(result.diagnostics).toEqual([eventDiagnostic("subagent_start", "factory-droid")]);
    });

    it("rule 5: a provider absent from A.1 gets the canonical name without a warning", () => {
      const result = renderHookBlock({
        event: "before_tool_execute",
        handlers: [{ type: "http", url: "https://example.test" }],
      }, "unknown-provider");

      expect(JSON.parse(result.output).event).toBe("before_tool_execute");
      expect(result.diagnostics).toEqual([]);
    });
  });

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

  it("renders narrow-event matchers byte-for-byte", () => {
    const matcher = "Read|Bash";
    const result = renderHookBlock({
      event: "before_file_read",
      matcher,
      handlers: [{ type: "http", url: "https://example.test" }],
    }, "cursor");

    expect(JSON.parse(result.output).event).toBe("beforeReadFile");
    expect(JSON.parse(result.output).matcher).toBe(matcher);
    expect(result.diagnostics).toEqual([]);
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
