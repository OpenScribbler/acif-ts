import { describe, expect, it } from "vitest";

import {
  AcifBodyHashError,
  canonicalizeCommandPlaceholders,
  classifyFrontmatterBody,
  computeFrontmatterBodyHash,
  computeHookBodyHash,
  computeMcpBodyHash,
  hashFile,
  stripEntryFrontmatter,
} from "../src/body_hash";

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

function frontmatterHash(files: Record<string, string | Uint8Array>, entryFile: string): string {
  return computeFrontmatterBodyHash({ files, entryFile }).value;
}

function commandHash(entryFile: string, body: string): string {
  return frontmatterHash({ [entryFile]: canonicalizeCommandPlaceholders(body) }, entryFile);
}

describe("frontmatter-bearing body_hash", () => {
  it("TV-1 computes the same skill body_hash regardless of pack context", () => {
    const bodyHash = computeFrontmatterBodyHash({
      files: {
        "SKILL.md": "---\ndescription: demo\n---\nUse this skill to demo hashing.\n",
      },
      entryFile: "SKILL.md",
    });

    expect(bodyHash).toEqual({
      algorithm: "sha256",
      classification: "single-file",
      value: "916e570331167c16f8112573d1b6020c134cc3d4019e8011693676d019b88ffe",
    });
  });

  it("TV-12 excludes only the root acif-sidecar.yaml from body_hash", () => {
    const base = frontmatterHash(
      {
        "SKILL.md": "Body prose.\n",
        "sub/acif-sidecar.yaml": "kind: skill\n",
      },
      "SKILL.md",
    );
    const withRootSidecar = frontmatterHash(
      {
        "SKILL.md": "Body prose.\n",
        "sub/acif-sidecar.yaml": "kind: skill\n",
        "acif-sidecar.yaml": "kind: skill\n",
      },
      "SKILL.md",
    );
    const subdirSidecarEdited = frontmatterHash(
      {
        "SKILL.md": "Body prose.\n",
        "sub/acif-sidecar.yaml": "kind: skill\nid: f47ac10b\n",
      },
      "SKILL.md",
    );

    expect(base).toBe("581e9b6b2dbd5a5947758f8ecdf67896c2a1225936ab5bd744a3973460b85169");
    expect(withRootSidecar).toBe(base);
    expect(subdirSidecarEdited).toBe("b4e9079283b7852f98fc2a9f9719699a1c5e3b48101695f8f7567314d3a2eae4");
  });

  it("TV-13 reports core §7 named body-boundary rejects", () => {
    expectAcifError(
      () =>
        computeFrontmatterBodyHash({
          files: { "SKILL.md": "Prose.\n" },
          entryFile: "SKILL.md",
          symlinks: ["scripts/link.sh"],
        }),
      "acif.body.symlink",
    );

    expectAcifError(
      () =>
        computeFrontmatterBodyHash({
          files: {
            "caf\u00e9.md": "NFC\n",
            "cafe\u0301.md": "NFD\n",
          },
          entryFile: "caf\u00e9.md",
        }),
      "acif.body.path_collision",
    );

    expectAcifError(
      () =>
        computeFrontmatterBodyHash({
          files: { LICENSE: "MIT\n", "README.md": "readme\n" },
          entryFile: "SKILL.md",
        }),
      "acif.body.empty",
    );
  });

  it("applies §7.3 text normalization only to the closed text-extension set", () => {
    expect(hashFile("scripts/run.sh", "\ufeff#!/bin/sh\r\necho hi\r")).toBe(
      hashFile("scripts/run.sh", "#!/bin/sh\necho hi\n"),
    );
    expect(hashFile("scripts/run.ps1", "Write-Host hi\r\n")).not.toBe(
      hashFile("scripts/run.ps1", "Write-Host hi\n"),
    );
  });

  it("strips only a leading entry-file frontmatter block per §7.3", () => {
    expect(new TextDecoder().decode(stripEntryFrontmatter("---\nkind: skill\n---\nBody\n"))).toBe("Body\n");
    expect(new TextDecoder().decode(stripEntryFrontmatter("Intro\n---\nnot frontmatter\n---\n"))).toBe(
      "Intro\n---\nnot frontmatter\n---\n",
    );
  });
});

describe("skill body_hash vectors", () => {
  it("TV-SKILL-h keeps materialized activation defaults out of body_hash", () => {
    const declaredFrontmatter = frontmatterHash(
      { "SKILL.md": "---\ndisplay_name: Demo\n---\nUse this to demo materialization.\n" },
      "SKILL.md",
    );
    const bodyOnly = frontmatterHash({ "SKILL.md": "Use this to demo materialization.\n" }, "SKILL.md");

    expect(declaredFrontmatter).toBe(bodyOnly);
  });

  it("TV-SKILL-g classifies bundled resources and pins single/multi-file body_hash values", () => {
    const case1 = computeFrontmatterBodyHash({
      files: { "SKILL.md": "Use this to demo classification.\n" },
      entryFile: "SKILL.md",
    });
    const case2 = computeFrontmatterBodyHash({
      files: {
        "SKILL.md": "Use this to demo classification.\n",
        LICENSE: "MIT\n",
        "README.md": "readme\n",
      },
      entryFile: "SKILL.md",
    });
    const case3 = computeFrontmatterBodyHash({
      files: {
        "SKILL.md": "Use this to demo classification.\n",
        "scripts/run.sh": "#!/bin/sh\necho hi\n",
      },
      entryFile: "SKILL.md",
    });

    expect(case1.classification).toBe("single-file");
    expect(case1.value).toBe("12d3cb2f53305b53fff6ca4ff1166fd1d063b1319642e0a0906a5539c8fa57b7");
    expect(case2.classification).toBe("single-file");
    expect(case2.value).toBe(case1.value);
    expect(case3.classification).toBe("multi-file");
    expect(case3.value).toBe("fef9a3e615ab4d41c1a990908bf9a3e5b47f70a73eaa16fc7e1578c9f4ab60df");
  });

  it("TV-SKILL-i applies the general body classification exclusions", () => {
    expect(
      classifyFrontmatterBody({
        files: { "SKILL.md": "Prose.\n", LICENSE: "MIT\n", README: "readme\n" },
        entryFile: "SKILL.md",
      }),
    ).toBe("single-file");

    expect(
      classifyFrontmatterBody({
        files: { "SKILL.md": "Prose.\n", "checklist.md": "- step\n" },
        entryFile: "SKILL.md",
      }),
    ).toBe("multi-file");
  });

  it("TV-SKILL-k keeps declared activation frontmatter out of body_hash and includes bundled resources", () => {
    const base = frontmatterHash(
      {
        "SKILL.md": "---\nactivation:\n  type: auto\n  user_invocable: true\n---\nProse.\n",
        "scripts/run.sh": "#!/bin/sh\necho v1\n",
      },
      "SKILL.md",
    );
    const frontmatterEdit = frontmatterHash(
      {
        "SKILL.md": "---\nactivation:\n  type: auto\n  user_invocable: false\n---\nProse.\n",
        "scripts/run.sh": "#!/bin/sh\necho v1\n",
      },
      "SKILL.md",
    );
    const resourceEdit = frontmatterHash(
      {
        "SKILL.md": "---\nactivation:\n  type: auto\n  user_invocable: true\n---\nProse.\n",
        "scripts/run.sh": "#!/bin/sh\necho v2\n",
      },
      "SKILL.md",
    );

    expect(frontmatterEdit).toBe(base);
    expect(resourceEdit).not.toBe(base);
  });

  it("TV-SKILL-n strips entry-file frontmatter in multi-file bodies", () => {
    const variant1 = frontmatterHash(
      {
        "SKILL.md": "---\ndescription: one\n---\nProse body.\n",
        "scripts/run.sh": "#!/bin/sh\necho hi\n",
      },
      "SKILL.md",
    );
    const variant2 = frontmatterHash(
      {
        "SKILL.md": "---\ndescription: two\n---\nProse body.\n",
        "scripts/run.sh": "#!/bin/sh\necho hi\n",
      },
      "SKILL.md",
    );

    expect(variant1).toBe(variant2);
    expect(variant1).toBe("b08c2af8a9d5c2eced158b49a13bacfe3d0a22221b965bd2a46672bc5b8f9648");
  });
});

describe("command, rule, agent, URI, and render body_hash vectors", () => {
  it("TV-COMMAND-a computes body_hash after lossless placeholder rewrite", () => {
    expect(commandHash("review.md", "Review PR {{args}} carefully.\n")).toBe(
      "eb6f4eb9bc130773a45fb39b20e9ad8e8a05fdabc011d85eeaf47dec08fa5cea",
    );
    expect(commandHash("review.md", "Review PR $ARGUMENTS carefully.\n")).toBe(
      "eb6f4eb9bc130773a45fb39b20e9ad8e8a05fdabc011d85eeaf47dec08fa5cea",
    );
  });

  it("TV-COMMAND-b collapses named placeholders before body_hash", () => {
    expect(commandHash("cmd.md", "Open ${input:filename} now.\n")).toBe(
      "200dd55e5537f6a8b7458781d1fb8e7e038b1f665a2ebe1eb1aea7aeea19a8ad",
    );
    expect(commandHash("cmd.md", "Open ${input:message} now.\n")).toBe(
      "200dd55e5537f6a8b7458781d1fb8e7e038b1f665a2ebe1eb1aea7aeea19a8ad",
    );
  });

  it("TV-COMMAND-h strips frontmatter from command body_hash", () => {
    const variant1 = frontmatterHash(
      { "cmd.md": "---\nmodel: model-a\nallowed_tools: [Read]\n---\nDo the task with $ARGUMENTS.\n" },
      "cmd.md",
    );
    const variant2 = frontmatterHash(
      { "cmd.md": "---\nmodel: model-b\nallowed_tools: [Read, Edit]\n---\nDo the task with $ARGUMENTS.\n" },
      "cmd.md",
    );

    expect(variant1).toBe(variant2);
    expect(variant1).toBe("711eb812c3c9e2ee14ae51852e6fe951be85a0141ec514d97eb7d63249df89fa");
  });

  it("TV-COMMAND-d, TV-COMMAND-f, and TV-COMMAND-g pin command body rewrite scope", () => {
    expect(canonicalizeCommandPlaceholders("Use it like:\n```\nreview {{args}}\n```\n")).toBe(
      "Use it like:\n```\nreview $ARGUMENTS\n```\n",
    );
    expect(canonicalizeCommandPlaceholders("git rebase --onto $1 $2 && echo ${@:3}\n")).toBe(
      "git rebase --onto $1 $2 && echo ${@:3}\n",
    );
    expect(canonicalizeCommandPlaceholders("Context: !{git status} and @{docs/notes.md}\n")).toBe(
      "Context: !{git status} and @{docs/notes.md}\n",
    );
  });

  it("TV-RULE-a and TV-RULE-k pin rule prose body_hash values", () => {
    expect(frontmatterHash({ "conventions.md": "Prefer functional patterns.\n" }, "conventions.md")).toBe(
      "3870d9fb5e9cff74b36ffd20141fd693c8500ff5e97469f4b2d41775c242feaf",
    );
    expect(
      frontmatterHash(
        { "conventions.md": "Follow @security.md and @~/company-standards.md.\n" },
        "conventions.md",
      ),
    ).toBe("4bcb019272bd88d646c10ca0b7ca088bf8215d0114f08e43ef164884f50fed7c");
  });

  it("TV-RULE-l keeps declared activation out of body_hash and includes prose edits", () => {
    const base = frontmatterHash(
      { "conventions.md": "---\nactivation:\n  mode: manual\n---\nGuidance prose.\n" },
      "conventions.md",
    );
    const modeEdit = frontmatterHash(
      { "conventions.md": "---\nactivation:\n  mode: always\n---\nGuidance prose.\n" },
      "conventions.md",
    );
    const proseEdit = frontmatterHash(
      { "conventions.md": "---\nactivation:\n  mode: manual\n---\nDifferent guidance prose.\n" },
      "conventions.md",
    );

    expect(modeEdit).toBe(base);
    expect(proseEdit).not.toBe(base);
  });

  it("TV-AGENT-h and TV-AGENT-i keep agent frontmatter out of body_hash", () => {
    const variants = ["Agent", "task", "spawn_agent", "use_subagent", "Task"].map((tool) =>
      frontmatterHash(
        { "scout.md": `---\ntools: [${tool}]\n---\nYou are a scout. Report findings only.\n` },
        "scout.md",
      ),
    );
    expect(new Set(variants).size).toBe(1);

    const base = frontmatterHash({ "scout.md": "---\nmodel: model-a\n---\nYou are a scout.\n" }, "scout.md");
    const modelEdit = frontmatterHash({ "scout.md": "---\nmodel: model-b\n---\nYou are a scout.\n" }, "scout.md");
    const promptEdit = frontmatterHash({ "scout.md": "---\nmodel: model-a\n---\nYou are a reviewer.\n" }, "scout.md");

    expect(modelEdit).toBe(base);
    expect(promptEdit).not.toBe(base);
  });

  it("TV-URI-s excludes source_uri from body_hash", () => {
    const body = { "SKILL.md": "Same bytes.\n" };
    expect(frontmatterHash(body, "SKILL.md")).toBe(frontmatterHash(body, "SKILL.md"));
  });

  it("TV-MCP-l and TV-RENDER-d preserve MCP body_hash when a no-type render re-canonicalizes", () => {
    const explicit = computeMcpBodyHash({
      servers: { demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server"] } },
    }).value;
    const defaulted = computeMcpBodyHash({
      servers: { demo: { command: "npx", args: ["-y", "@demo/mcp-server"] } },
    }).value;

    expect(defaulted).toBe(explicit);
  });
});

describe("hook body_hash vectors", () => {
  it("TV-HOOK-g hashes post-translation canonical event wiring", () => {
    expect(
      computeHookBodyHash({
        event: "before_tool_execute",
        handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\nexit 0\n" }] }],
      }).value,
    ).toBe("9c8ab2d7f2465728140264d725011daad97054aceaaedfa9dd0a03d68d06b629");
  });

  it("TV-HOOK-h materializes an absent handler type to command for hashing", () => {
    const absentType = computeHookBodyHash({
      event: "session_start",
      handlers: [{ scripts: [{ type: "inline", content: "#!/bin/sh\necho hi\n" }] }],
    }).value;
    const explicitCommand = computeHookBodyHash({
      event: "session_start",
      handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\necho hi\n" }] }],
    }).value;

    expect(absentType).toBe(explicitCommand);
  });

  it("TV-HOOK-d, TV-HOOK-i, and TV-HOOK-j reject empty handlers, missing files, and invalid paths", () => {
    expectAcifError(() => computeHookBodyHash({ event: "session_start", handlers: [] }), "acif.hook.handlers_missing");

    expectAcifError(
      () =>
        computeHookBodyHash(
          { event: "session_start", handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh" }] }] },
          { files: {} },
        ),
      "acif.hook.script_file_missing",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "session_start",
          handlers: [{ type: "command", scripts: [{ type: "file", path: "/etc/hooks/run.sh" }] }],
        }),
      "acif.hook.script_path_invalid",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "session_start",
          handlers: [{ type: "command", scripts: [{ type: "file", path: "../outside/run.sh" }] }],
        }),
      "acif.hook.script_path_invalid",
    );
  });

  it("TV-PLATFORM-c through TV-PLATFORM-f report script-entry rejects", () => {
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "before_tool_execute",
          handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh", os: [] }] }],
        }),
      "acif.hook.script_os_empty",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "before_tool_execute",
          handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh", arch: [] }] }],
        }),
      "acif.hook.script_arch_empty",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "before_tool_execute",
          handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh", os: ["linux", "freebsd"] }] }],
        }),
      "acif.hook.script_os_invalid",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "file", path: "hooks/run.sh" },
                { type: "file", path: "hooks/run.ps1" },
              ],
            },
          ],
        }),
      "acif.hook.script_default_ambiguous",
    );
    expectAcifError(
      () =>
        computeHookBodyHash({
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "file", path: "hooks/unix.sh", os: ["darwin", "linux"] },
                { type: "file", path: "hooks/lin.sh", os: ["linux"] },
              ],
            },
          ],
        }),
      "acif.hook.script_platform_ambiguous",
    );
  });

  it("TV-PLATFORM-i and TV-PLATFORM-i2 pin hook file-manifest plus wiring hashes", () => {
    expect(
      computeHookBodyHash(
        {
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "file", path: "hooks/mac.sh", os: ["darwin"] },
                { type: "file", path: "hooks/lin.sh", os: ["linux"] },
                { type: "file", path: "hooks/win.cmd", os: ["windows"] },
                { type: "file", path: "hooks/base.sh" },
              ],
            },
          ],
        },
        {
          files: {
            "hooks/base.sh": "#!/bin/sh\necho base\n",
            "hooks/win.cmd": "@echo off\r\necho win\r\n",
            "hooks/lin.sh": "#!/bin/sh\necho lin\n",
            "hooks/mac.sh": "#!/bin/sh\necho mac\n",
          },
        },
      ).value,
    ).toBe("11f1e91480d2fdfd247311cc52240bf0fb2293febeccaeeadafacd74707cb32d");

    expect(
      computeHookBodyHash(
        {
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "file", path: "hooks/unix.sh", os: ["darwin", "linux"] },
                { type: "file", path: "hooks/win.cmd", os: ["windows"] },
                { type: "file", path: "hooks/base.sh" },
              ],
            },
          ],
        },
        {
          files: {
            "hooks/base.sh": "#!/bin/sh\necho base\n",
            "hooks/win.cmd": "@echo off\r\necho win\r\n",
            "hooks/unix.sh": "#!/bin/sh\necho unix\n",
          },
        },
      ).value,
    ).toBe("9cbd1f0d7f47b8175ece2d43150b8df92c0f5c50b4cacf537ac6372313e8aeb3");
  });

  it("TV-PLATFORM-q moves body_hash when OS tags or interpreter passthrough change", () => {
    const files = { "hooks/run.sh": "#!/bin/sh\necho ok\n" };
    const base = computeHookBodyHash(
      {
        event: "before_tool_execute",
        handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh", os: ["linux"] }] }],
      },
      { files },
    ).value;
    const osFlipped = computeHookBodyHash(
      {
        event: "before_tool_execute",
        handlers: [{ type: "command", scripts: [{ type: "file", path: "hooks/run.sh", os: ["windows"] }] }],
      },
      { files },
    ).value;
    const passthroughAdded = computeHookBodyHash(
      {
        event: "before_tool_execute",
        handlers: [
          { type: "command", scripts: [{ type: "file", path: "hooks/run.sh", os: ["linux"], shell: "powershell" }] },
        ],
      },
      { files },
    ).value;

    expect(base).toBe("194225ce5a7ec641253e47b6abd7f07b22fdf8ac4845cba159bef8ffe7f8783f");
    expect(osFlipped).toBe("f5c964cdeddb304e801431f21c2c6c29f0e1e51cf99c63af78d2be58057c7dfc");
    expect(passthroughAdded).not.toBe(base);
  });

  it("TV-PLATFORM-q2 normalizes OS order, script order, and inline CRLF before hashing", () => {
    const files = { "hooks/win.cmd": "@echo off\r\necho hi\r\n" };
    const variantA = computeHookBodyHash(
      {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "inline", content: "#!/bin/sh\necho hi\n", os: ["darwin", "linux"] },
              { type: "file", path: "hooks/win.cmd", os: ["windows"] },
            ],
          },
        ],
      },
      { files },
    ).value;
    const variantB = computeHookBodyHash(
      {
        event: "before_tool_execute",
        handlers: [
          {
            type: "command",
            scripts: [
              { type: "file", path: "hooks/win.cmd", os: ["windows"] },
              { type: "inline", content: "#!/bin/sh\r\necho hi\r\n", os: ["linux", "darwin"] },
            ],
          },
        ],
      },
      { files },
    ).value;

    expect(variantA).toBe(variantB);
    expect(variantA).toBe("bdee51e032051d9fc88d39f9196e47b4742d51fe4673cb020ba82c47903bee3a");
  });

  it("TV-L2-b keeps envelope display_name edits out of hook body_hash", () => {
    const hook = {
      event: "before_tool_execute",
      handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\nexit 0\n" }] }],
    };

    expect(computeHookBodyHash(hook).value).toBe(computeHookBodyHash({ ...hook }).value);
  });
});

describe("MCP body_hash vectors", () => {
  it("TV-MCP-a pins stdio and streamable-http body_hash values after type materialization", () => {
    expect(
      computeMcpBodyHash({
        servers: { demo: { command: "npx", args: ["-y", "@demo/mcp-server"] } },
      }).value,
    ).toBe("26387bc7f0b779925f2d6e704f3dfe590fd381893aa301bc28d2ae399f5e3b52");

    expect(
      computeMcpBodyHash({
        servers: { demo: { url: "https://mcp.example.com/sse-endpoint" } },
      }).value,
    ).toBe("e55a9fc091b4e5267c4c07199ee60712de6c47a9846f929c5cf2d1d9da57f98a");
  });

  it("TV-MCP-b, TV-MCP-c, TV-MCP-h, and TV-MCP-i report MCP reject identifiers", () => {
    expectAcifError(
      () => computeMcpBodyHash({ servers: { demo: { command: "npx", url: "https://mcp.example.com/" } } }),
      "acif.mcp.transport_default_ambiguous",
    );
    expectAcifError(
      () => computeMcpBodyHash({ servers: { demo: { env: { TOKEN: "${TOKEN}" } } } }),
      "acif.mcp.transport_default_undetermined",
    );
    expectAcifError(
      () => computeMcpBodyHash({ servers: { demo: { type: "websocket", url: "https://x.example/" } } }),
      "acif.mcp.transport_type_invalid",
    );
    expectAcifError(
      () => computeMcpBodyHash({ servers: { demo: { type: "Stdio", command: "npx" } } }),
      "acif.mcp.transport_type_invalid",
    );
    expectAcifError(() => computeMcpBodyHash({}), "acif.mcp.servers_missing");
    expectAcifError(() => computeMcpBodyHash({ servers: {} }), "acif.mcp.servers_missing");
  });

  it("TV-MCP-d treats explicit and defaulted stdio type as identical body_hash input", () => {
    const explicit = computeMcpBodyHash({
      servers: { demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server"] } },
    }).value;
    const defaulted = computeMcpBodyHash({
      servers: { demo: { command: "npx", args: ["-y", "@demo/mcp-server"] } },
    }).value;

    expect(defaulted).toBe(explicit);
    expect(defaulted).toBe("26387bc7f0b779925f2d6e704f3dfe590fd381893aa301bc28d2ae399f5e3b52");
  });

  it("TV-MCP-k moves body_hash for args, env, and url edits", () => {
    const base = computeMcpBodyHash({
      servers: {
        demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server"], env: { MODE: "safe" } },
        remote: { type: "streamable-http", url: "https://mcp.example.com/a" },
      },
    }).value;

    expect(
      computeMcpBodyHash({
        servers: {
          demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server-evil"], env: { MODE: "safe" } },
          remote: { type: "streamable-http", url: "https://mcp.example.com/a" },
        },
      }).value,
    ).not.toBe(base);
    expect(
      computeMcpBodyHash({
        servers: {
          demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server"], env: { MODE: "unsafe" } },
          remote: { type: "streamable-http", url: "https://mcp.example.com/a" },
        },
      }).value,
    ).not.toBe(base);
    expect(
      computeMcpBodyHash({
        servers: {
          demo: { type: "stdio", command: "npx", args: ["-y", "@demo/mcp-server"], env: { MODE: "safe" } },
          remote: { type: "streamable-http", url: "https://mcp.evil.example/a" },
        },
      }).value,
    ).not.toBe(base);
  });

  it("TV-MCP-k2 sorts tool-filter sets and relies on JCS server-key ordering", () => {
    const variantA = computeMcpBodyHash({
      servers: {
        alpha: { type: "stdio", command: "a", includeTools: ["read", "export"] },
        beta: { type: "stdio", command: "b" },
      },
    }).value;
    const variantB = computeMcpBodyHash({
      servers: {
        beta: { type: "stdio", command: "b" },
        alpha: { type: "stdio", command: "a", includeTools: ["export", "read"] },
      },
    }).value;

    expect(variantB).toBe(variantA);
  });
});
