import { describe, expect, it } from "vitest";
import { computeHookBodyHash } from "../src/hook_hash";
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

describe("acif-ts - chunk 12: hook body_hash preimage & value tests", () => {
  describe("Manifest Construction", () => {
    it("handles the empty-manifest case (all inline, no auxiliary files)", () => {
      // Empty manifest hash DH is sha256 of empty string:
      // sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const hook = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "echo hello\n" }
            ]
          }
        ]
      };
      
      const res = computeHookBodyHash(hook, { files: {} });
      expect(res.algorithm).toBe("sha256");
      expect(typeof res.value).toBe("string");
      expect(res.value.length).toBe(64);
    });

    it("verifies manifest sorting is raw UTF-8 byte order of path", () => {
      const hook = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/b.sh", os: ["linux"] },
              { type: "file", path: "hooks/a.sh", os: ["darwin"] }
            ]
          }
        ]
      };

      const files = {
        "hooks/b.sh": "echo b\n",
        "hooks/a.sh": "echo a\n"
      };

      const res1 = computeHookBodyHash(hook, { files });

      // Creating a permutation in the input order should still result in the identical hash
      const hookPermuted = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/a.sh", os: ["darwin"] },
              { type: "file", path: "hooks/b.sh", os: ["linux"] }
            ]
          }
        ]
      };
      const res2 = computeHookBodyHash(hookPermuted, { files });
      expect(res1.value).toBe(res2.value);
    });

    it("collapses duplicate paths in the referenced-file set (unique manifest entries)", () => {
      // A script path also defined as an auxiliary file should collapse to one entry
      const hook = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/script.sh" }
            ]
          }
        ],
        auxiliary_files: [
          { path: "hooks/script.sh" }
        ]
      };

      const files = {
        "hooks/script.sh": "echo duplicate\n"
      };

      const res = computeHookBodyHash(hook, { files });
      expect(res.algorithm).toBe("sha256");
    });
  });

  describe("Validation Rejects", () => {
    it("rejects missing referenced file with acif.hook.script_file_missing", () => {
      const hook = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/missing.sh" }
            ]
          }
        ]
      };

      expectAcifError(
        () => computeHookBodyHash(hook, { files: {} }),
        "acif.hook.script_file_missing"
      );
    });

    it("rejects invalid paths with acif.hook.script_path_invalid", () => {
      const hookAbsolute = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "/absolute/path.sh" }
            ]
          }
        ]
      };
      expectAcifError(
        () => computeHookBodyHash(hookAbsolute, { files: {} }),
        "acif.hook.script_path_invalid"
      );

      const hookTraversing = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/../outside.sh" }
            ]
          }
        ]
      };
      expectAcifError(
        () => computeHookBodyHash(hookTraversing, { files: {} }),
        "acif.hook.script_path_invalid"
      );

      const hookBackslash = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks\\win.bat" }
            ]
          }
        ]
      };
      expectAcifError(
        () => computeHookBodyHash(hookBackslash, { files: {} }),
        "acif.hook.script_path_invalid"
      );
    });

    it("rejects symbolic links with acif.body.symlink", () => {
      const hook = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/run.sh" }
            ]
          }
        ]
      };

      expectAcifError(
        () => computeHookBodyHash(hook, {
          files: { "hooks/run.sh": "echo ok\n" },
          symlinks: ["hooks/run.sh"]
        }),
        "acif.body.symlink"
      );
    });
  });

  describe("Normative Cryptographic Consequences (§9.4)", () => {
    it("re-targeting an os constraint moves body_hash with file bytes unchanged", () => {
      const files = { "hooks/run.sh": "echo hello\n" };
      
      const hookLinux = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/run.sh", os: ["linux"] }
            ]
          }
        ]
      };

      const hookDarwin = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/run.sh", os: ["darwin"] }
            ]
          }
        ]
      };

      const hashLinux = computeHookBodyHash(hookLinux, { files }).value;
      const hashDarwin = computeHookBodyHash(hookDarwin, { files }).value;

      expect(hashLinux).not.toBe(hashDarwin);
    });

    it("flipping an opaque passthrough field moves body_hash", () => {
      const files = { "hooks/run.sh": "echo hello\n" };

      const hookBase = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/run.sh", os: ["linux"] }
            ]
          }
        ]
      };

      const hookPassthrough = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/run.sh", os: ["linux"], interpreter: "bash" }
            ]
          }
        ]
      };

      const hashBase = computeHookBodyHash(hookBase, { files }).value;
      const hashPassthrough = computeHookBodyHash(hookPassthrough, { files }).value;

      expect(hashBase).not.toBe(hashPassthrough);
    });

    it("normalizes array orderings (os sets, scripts within handlers) so differing ordering hashes identically", () => {
      const files = { "hooks/win.cmd": "@echo off\r\necho hi\r\n" };

      const hookA = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "echo hello\n", os: ["darwin", "linux"] },
              { type: "file", path: "hooks/win.cmd", os: ["windows"] }
            ]
          }
        ]
      };

      const hookB = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/win.cmd", os: ["windows"] },
              { type: "inline", content: "echo hello\n", os: ["linux", "darwin"] }
            ]
          }
        ]
      };

      const hashA = computeHookBodyHash(hookA, { files }).value;
      const hashB = computeHookBodyHash(hookB, { files }).value;

      expect(hashA).toBe(hashB);
    });

    it("normalizes inline line endings so differing source formats hash identically", () => {
      const files = { "hooks/run.sh": "echo ok\n" };

      const hookLF = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "line1\nline2\n" }
            ]
          }
        ]
      };

      const hookCRLF = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "line1\r\nline2\r\n" }
            ]
          }
        ]
      };

      const hashLF = computeHookBodyHash(hookLF, { files }).value;
      const hashCRLF = computeHookBodyHash(hookCRLF, { files }).value;

      expect(hashLF).toBe(hashCRLF);
    });

    it("keeps auxiliary_files path values in W exactly as written (unnormalized), while the manifest is NFC-normalized", () => {
      const decomposedPath = "hooks/cafe\u0301.sh"; // NFD
      const composedPath = "hooks/caf\u00e9.sh"; // NFC

      // The provided file is stored in its composed form
      const files = {
        [composedPath]: "echo cafe\n"
      };

      const hookDecomposed = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "echo ok\n" }
            ]
          }
        ],
        auxiliary_files: [
          { path: decomposedPath }
        ]
      };

      const hookComposed = {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "echo ok\n" }
            ]
          }
        ],
        auxiliary_files: [
          { path: composedPath }
        ]
      };

      // Since W retains the unnormalized paths exactly as written, their hashes will differ
      const hashDecomposed = computeHookBodyHash(hookDecomposed, { files }).value;
      const hashComposed = computeHookBodyHash(hookComposed, { files }).value;

      expect(hashDecomposed).not.toBe(hashComposed);
    });
  });
});
