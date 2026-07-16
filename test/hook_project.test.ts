import { describe, expect, it } from "vitest";
import { projectOsCoverage, projectDerivedCapabilities, evaluateHookInstall } from "../src/hook_project";

describe("hook registry projections", () => {
  it("computes os_coverage projection correctly for standard cases", () => {
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

    const projection = projectOsCoverage(hook);
    expect(projection.derivable).toBe(true);
    expect(projection.os).toEqual(["darwin", "windows"]);
    expect(projection.unconstrained).toBe(true);
    expect(projection.os_divergent).toBe(true); // windows selection (win.bat) != darwin selection (mac.sh)
    expect(projection.provenance).toBe("declared");
  });

  it("handles non-divergent handlers", () => {
    const hook = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/common.sh", os: ["linux", "darwin"] },
            { path: "scripts/common.sh" }
          ]
        }
      ]
    };

    const projection = projectOsCoverage(hook);
    expect(projection.os_divergent).toBe(false); // same executable identity 'file:scripts/common.sh'
  });

  it("rolls up provenance correctly from metadata", () => {
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

    const provenanceMixed = {
      0: {
        0: { windows: "declared" },
        1: { darwin: "inferred-from-convention" }
      }
    };

    const projectionMixed = projectOsCoverage(hook, provenanceMixed);
    expect(projectionMixed.provenance).toBe("mixed");

    const provenanceInferred = {
      0: {
        0: { windows: "inferred-from-convention" },
        1: { darwin: "inferred-from-convention" }
      }
    };

    const projectionInferred = projectOsCoverage(hook, provenanceInferred);
    expect(projectionInferred.provenance).toBe("inferred-from-convention");
  });

  it("derives D_K capabilities correctly", () => {
    const hook1 = {
      event: "before_prompt",
      matcher: ".*",
      handlers: [
        {
          type: "command",
          async: true,
          scripts: [{ path: "scripts/run.sh" }]
        }
      ]
    };

    const capabilities1 = projectDerivedCapabilities(hook1);
    expect(capabilities1).toEqual({
      handler_types: true,
      matcher_patterns: true,
      async_execution: true
    });

    const hook2 = {
      event: "before_prompt",
      handlers: [
        {
          type: "command",
          scripts: [{ path: "scripts/run.sh" }]
        }
      ]
    };

    const capabilities2 = projectDerivedCapabilities(hook2);
    expect(capabilities2).toEqual({
      handler_types: true,
      matcher_patterns: false,
      async_execution: false
    });
  });

  it("evaluates install rules and detects coverage gaps", () => {
    const blockingHook = {
      event: "session_start",
      blocking: true,
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] }
          ]
        }
      ]
    };

    const nonBlockingHook = {
      event: "session_start",
      blocking: false,
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "scripts/win.bat", os: ["windows"] }
          ]
        }
      ]
    };

    // Evaluated against Windows (no gap)
    const res1 = evaluateHookInstall(blockingHook, "windows");
    expect(res1.install).toBe("proceed");
    expect(res1.diagnostics).toHaveLength(0);

    // Evaluated against Linux (gap!)
    const res2 = evaluateHookInstall(blockingHook, "linux");
    expect(res2.install).toBe("refuse-unless-operator-opt-in");
    expect(res2.diagnostics).toHaveLength(1);
    expect(res2.diagnostics[0].id).toBe("acif.hook.script_no_platform_match");
    expect(res2.diagnostics[0].params).toEqual({ os: "linux" });

    // Non-blocking hook evaluated against Linux (warn only, proceed)
    const res3 = evaluateHookInstall(nonBlockingHook, "linux");
    expect(res3.install).toBe("proceed");
    expect(res3.diagnostics).toHaveLength(1);
    expect(res3.diagnostics[0].id).toBe("acif.hook.script_no_platform_match");
  });
});
