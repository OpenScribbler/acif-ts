import { describe, expect, it } from "vitest";
import {
  canonicalizeHookWithPlatform,
  canonicalizeProviderPlatform,
  selectScript,
} from "../src/hook_platform";
import { AcifBodyHashError } from "../src/body_hash";

function expectAcifError(fn: () => unknown, id: string): any {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AcifBodyHashError);
    const err = error as AcifBodyHashError;
    expect(err.id).toBe(id);
    expect(err.code).toBe(id);
    return err;
  }
  throw new Error(`Expected error with id: ${id}`);
}

describe("acif-ts - chunk 11: §7.1 and §7.2 validations", () => {
  it("rejects non-member OS values with acif.hook.script_os_invalid", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            {
              type: "file",
              path: "hooks/run.sh",
              os: ["freebsd"],
            },
          ],
        },
      ],
    };
    const err = expectAcifError(() => canonicalizeHookWithPlatform(input), "acif.hook.script_os_invalid");
    expect(err.params).toEqual({ os: "freebsd", script: 0 });
    expect(err.message).toContain("Remedy:");
  });

  it("rewrites provider aliases (e.g. osx to darwin) before validation", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            {
              type: "file",
              path: "hooks/run.sh",
              os: ["osx", "linux"],
            },
          ],
        },
      ],
    };
    const res = canonicalizeHookWithPlatform(input);
    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts[0].os).toEqual(["darwin", "linux"]); // sorted, osx -> darwin
  });

  it("rejects empty os array with acif.hook.script_os_empty", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            {
              type: "file",
              path: "hooks/run.sh",
              os: [],
            },
          ],
        },
      ],
    };
    const err = expectAcifError(() => canonicalizeHookWithPlatform(input), "acif.hook.script_os_empty");
    expect(err.params).toEqual({ script: 0 });
    expect(err.message).toContain("Remedy:");
  });

  it("rejects empty arch array with acif.hook.script_arch_empty", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            {
              type: "file",
              path: "hooks/run.sh",
              arch: [],
            },
          ],
        },
      ],
    };
    const err = expectAcifError(() => canonicalizeHookWithPlatform(input), "acif.hook.script_arch_empty");
    expect(err.params).toEqual({ script: 0 });
    expect(err.message).toContain("Remedy:");
  });

  it("carries arch in canonical form and sorts/deduplicates arch set", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            {
              type: "file",
              path: "hooks/run.sh",
              arch: ["x86_64", "arm64", "x86_64"],
            },
          ],
        },
      ],
    };
    const res = canonicalizeHookWithPlatform(input);
    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts[0].arch).toEqual(["arm64", "x86_64"]);
  });

  it("rejects multiple default script entries with acif.hook.script_default_ambiguous", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            { type: "file", path: "hooks/run1.sh" },
            { type: "file", path: "hooks/run2.sh" },
          ],
        },
      ],
    };
    const err = expectAcifError(() => canonicalizeHookWithPlatform(input), "acif.hook.script_default_ambiguous");
    expect(err.message).toContain("Remedy:");
  });

  it("rejects overlapping constrained entries with acif.hook.script_platform_ambiguous", () => {
    const input = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            { type: "file", path: "hooks/run-windows.cmd", os: ["windows", "linux"] },
            { type: "file", path: "hooks/run-linux.sh", os: ["linux", "darwin"] },
          ],
        },
      ],
    };
    const err = expectAcifError(() => canonicalizeHookWithPlatform(input), "acif.hook.script_platform_ambiguous");
    expect(err.params).toEqual({
      os: "linux",
      entries: [0, 1],
    });
    expect(err.message).toContain("Remedy:");
  });
});

describe("acif-ts - chunk 11: §7.3 Selection", () => {
  const scripts = [
    { type: "file", path: "hooks/run-win.bat", os: ["windows"] },
    { type: "file", path: "hooks/run-unix.sh", os: ["darwin", "linux"] },
  ];

  it("selects constrained entry matching the target OS", () => {
    expect(selectScript(scripts, "windows").selected).toEqual(scripts[0]);
    expect(selectScript(scripts, "windows").diagnostics).toEqual([]);

    expect(selectScript(scripts, "linux").selected).toEqual(scripts[1]);
    expect(selectScript(scripts, "linux").diagnostics).toEqual([]);

    expect(selectScript(scripts, "darwin").selected).toEqual(scripts[1]);
    expect(selectScript(scripts, "darwin").diagnostics).toEqual([]);
  });

  it("selects default entry if no constrained entry matches", () => {
    const scriptsWithDefault = [
      { type: "file", path: "hooks/run-win.bat", os: ["windows"] },
      { type: "file", path: "hooks/default.sh" },
    ];
    expect(selectScript(scriptsWithDefault, "windows").selected).toEqual(scriptsWithDefault[0]);
    expect(selectScript(scriptsWithDefault, "windows").diagnostics).toEqual([]);

    expect(selectScript(scriptsWithDefault, "linux").selected).toEqual(scriptsWithDefault[1]);
    expect(selectScript(scriptsWithDefault, "linux").diagnostics).toEqual([]);

    expect(selectScript(scriptsWithDefault, "darwin").selected).toEqual(scriptsWithDefault[1]);
    expect(selectScript(scriptsWithDefault, "darwin").diagnostics).toEqual([]);
  });

  it("returns no-selection (null) and reports diagnostic acif.hook.script_no_platform_match on no-op branch", () => {
    const scriptsNoDefault = [
      { type: "file", path: "hooks/run-win.bat", os: ["windows"] },
    ];
    const res = selectScript(scriptsNoDefault, "linux");
    expect(res.selected).toBeNull();
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0].id).toBe("acif.hook.script_no_platform_match");
    expect(res.diagnostics[0].params).toEqual({ os: "linux" });
    expect(res.diagnostics[0].message).toContain("Remedy:");
  });

  it("rejects invalid target OS for selection", () => {
    expectAcifError(() => selectScript(scripts, "freebsd"), "acif.hook.script_os_invalid");
  });
});

describe("acif-ts - chunk 11: §7.4 provider-mechanism mapping evaluation order & envelope", () => {
  it("rejects missing or null content with acif.hook.platform_mechanism_malformed", () => {
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map", path: "config" }),
      "acif.hook.platform_mechanism_malformed"
    );
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map", path: "config", content: null }),
      "acif.hook.platform_mechanism_malformed"
    );
  });

  it("rejects non-decodable JSON string content with acif.hook.platform_mechanism_malformed", () => {
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map", path: "config", content: "{invalid-json" }),
      "acif.hook.platform_mechanism_malformed"
    );
  });

  it("passes ordinary hook extension blocks (carrying event member) through directly without mechanism classification", () => {
    const content = {
      event: "session_start",
      handlers: [
        {
          type: "command",
          scripts: [{ type: "file", path: "hooks/session.sh" }],
        },
      ],
    };
    const res = canonicalizeProviderPlatform({
      provider: "filename-extension-convention", // even with this token, event presence triggers passthrough!
      path: "config",
      content,
    });
    expect(res.hook.event).toBe("session_start");
    expect(res.diagnostics).toEqual([]);
    expect(res.provenance[0][0].session_start).toBeUndefined(); // no os tags to track
  });

  it("rejects unrecognized mechanism tokens with acif.hook.platform_unmappable", () => {
    const content = { command: "hooks/run.sh" };
    const err = expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "unknown-mechanism", path: "config", content }),
      "acif.hook.platform_unmappable"
    );
    expect(err.params).toEqual({ provider: "unknown-mechanism" });
  });

  it("does NOT reject member or alias tokens with platform_unmappable", () => {
    // Ensuring shape violation is thrown instead of unmappable
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map-provider", path: "config", content: [] }),
      "acif.hook.platform_mechanism_malformed"
    );
  });
});

describe("acif-ts - chunk 11: per-os-key-map happy path and shape predicates", () => {
  it("maps and merges keys correctly, and supports alias", () => {
    const content = {
      windows: "hooks/run.sh",
      linux: "hooks/run.sh",
      osx: "hooks/run_mac.sh",
      command: "hooks/default.sh",
    };

    const res = canonicalizeProviderPlatform({
      provider: "per-os-key-map-provider",
      path: "config",
      content,
    });

    const handler = res.hook.handlers[0] as any;
    // Expected scripts:
    // 1. { type: "file", path: "hooks/run.sh", os: ["linux", "windows"] }
    // 2. { type: "file", path: "hooks/run_mac.sh", os: ["darwin"] }
    // 3. { type: "file", path: "hooks/default.sh" }
    // Note: scripts are sorted by canonical JSON representation:
    // canonical JSON of {type:"file",path:"hooks/default.sh"} vs others
    expect(handler.scripts).toContainEqual({
      type: "file",
      path: "hooks/run.sh",
      os: ["linux", "windows"],
    });
    expect(handler.scripts).toContainEqual({
      type: "file",
      path: "hooks/run_mac.sh",
      os: ["darwin"],
    });
    expect(handler.scripts).toContainEqual({
      type: "file",
      path: "hooks/default.sh",
    });

    // Provenance must be declared
    // Let's find index of run.sh
    const runIdx = handler.scripts.findIndex((s: any) => s.path === "hooks/run.sh");
    expect(res.provenance[0][runIdx]).toEqual({
      linux: "declared",
      windows: "declared",
    });
  });

  it("allows other passthrough keys on command", () => {
    const content = {
      command: "hooks/default.sh",
      shell: "bash",
      timeout: 30,
    };
    const res = canonicalizeProviderPlatform({
      provider: "per-os-key-map",
      path: "config",
      content,
    });
    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts[0]).toEqual({
      type: "file",
      path: "hooks/default.sh",
      shell: "bash",
      timeout: 30,
    });
  });

  it("rejects non-string values under keys with acif.hook.platform_mechanism_malformed", () => {
    const content = {
      windows: 123,
    };
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map", path: "config", content }),
      "acif.hook.platform_mechanism_malformed"
    );
  });

  it("rejects passthrough keys without command with acif.hook.platform_mechanism_malformed", () => {
    const content = {
      shell: "bash",
    };
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "per-os-key-map", path: "config", content }),
      "acif.hook.platform_mechanism_malformed"
    );
  });
});

describe("acif-ts - chunk 11: dual-shell-fields happy path and shape predicates", () => {
  it("maps bash and powershell fields with dual-shell collapse and proxy diagnostic", () => {
    const content = {
      bash: "hooks/run-unix.sh",
      powershell: "hooks/run-win.ps1",
    };
    const res = canonicalizeProviderPlatform({
      provider: "dual-shell-fields",
      path: "config",
      content,
    });

    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts).toContainEqual({
      type: "file",
      path: "hooks/run-unix.sh",
      os: ["darwin", "linux"],
    });
    expect(handler.scripts).toContainEqual({
      type: "file",
      path: "hooks/run-win.ps1",
      os: ["windows"],
    });

    // Provenance must be inferred-from-convention
    const unixIdx = handler.scripts.findIndex((s: any) => s.path === "hooks/run-unix.sh");
    expect(res.provenance[0][unixIdx]).toEqual({
      darwin: "inferred-from-convention",
      linux: "inferred-from-convention",
    });

    // Check proxy diagnostic
    expect(res.diagnostics).toContainEqual({
      id: "acif.hook.platform_shell_os_proxy",
      message: "Inferred OS constraints from dual-shell fields 'bash' and 'powershell'.",
    });
  });

  it("rejects empty dual-shell config", () => {
    expectAcifError(
      () => canonicalizeProviderPlatform({ provider: "dual-shell-fields", path: "config", content: {} }),
      "acif.hook.platform_mechanism_malformed"
    );
  });

  it("rejects non-string values or unrecognized keys in dual-shell-fields", () => {
    expectAcifError(
      () =>
        canonicalizeProviderPlatform({
          provider: "dual-shell-fields",
          path: "config",
          content: { bash: 123 },
        }),
      "acif.hook.platform_mechanism_malformed"
    );
    expectAcifError(
      () =>
        canonicalizeProviderPlatform({
          provider: "dual-shell-fields",
          path: "config",
          content: { bash: "run.sh", other: "bad" },
        }),
      "acif.hook.platform_mechanism_malformed"
    );
  });
});

describe("acif-ts - chunk 11: filename-extension-convention happy path and shape predicates", () => {
  it("infers windows OS for .ps1, .cmd, .bat extensions", () => {
    const res = canonicalizeProviderPlatform({
      provider: "filename-extension-convention",
      path: "config",
      content: { file: "hooks/run.cmd" },
    });
    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts[0]).toEqual({
      type: "file",
      path: "hooks/run.cmd",
      os: ["windows"],
    });
    expect(res.provenance[0][0]).toEqual({
      windows: "inferred-from-convention",
    });
    expect(res.diagnostics).toContainEqual({
      id: "acif.hook.platform_filename_inferred",
      message: "Successfully inferred OS constraints (windows) from filename extension for path 'hooks/run.cmd'.",
      params: { path: "hooks/run.cmd" },
    });
  });

  it("infers darwin and linux OS for .sh and extensionless scripts", () => {
    const resSh = canonicalizeProviderPlatform({
      provider: "filename-extension-convention",
      path: "config",
      content: { file: "hooks/run.sh" },
    });
    expect((resSh.hook.handlers[0] as any).scripts[0].os).toEqual(["darwin", "linux"]);

    const resNone = canonicalizeProviderPlatform({
      provider: "filename-extension-convention",
      path: "config",
      content: { file: "hooks/run" },
    });
    expect((resNone.hook.handlers[0] as any).scripts[0].os).toEqual(["darwin", "linux"]);
  });

  it("defaults to unconstrained and emits uninferable diagnostic for other extensions", () => {
    const res = canonicalizeProviderPlatform({
      provider: "filename-extension-convention",
      path: "config",
      content: { file: "hooks/run.py" },
    });
    const handler = res.hook.handlers[0] as any;
    expect(handler.scripts[0].os).toBeUndefined(); // unconstrained
    expect(res.diagnostics).toContainEqual({
      id: "acif.hook.platform_filename_uninferable",
      message: "Could not infer OS constraints from filename extension for path 'hooks/run.py'. Defaulting to unconstrained.",
      params: { path: "hooks/run.py" },
    });
  });

  it("rejects missing file key or non-string file value", () => {
    expectAcifError(
      () =>
        canonicalizeProviderPlatform({
          provider: "filename-extension-convention",
          path: "config",
          content: {},
        }),
      "acif.hook.platform_mechanism_malformed"
    );
    expectAcifError(
      () =>
        canonicalizeProviderPlatform({
          provider: "filename-extension-convention",
          path: "config",
          content: { file: 123 },
        }),
      "acif.hook.platform_mechanism_malformed"
    );
  });
});
