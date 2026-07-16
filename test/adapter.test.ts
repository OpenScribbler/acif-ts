import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { handleRequest } from "../src/adapter";

const VALID_UUID_V4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TV1_BODY_HASH = "916e570331167c16f8112573d1b6020c134cc3d4019e8011693676d019b88ffe";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("handleRequest protocol", () => {
  it("responds to the protocol-2 handshake", async () => {
    await expect(handleRequest({ op: "hello", runner_protocol: 2 })).resolves.toEqual({
      ok: true,
      result: {
        implementation: "acif-ts",
        version: "0.1.0",
        adapter_protocol: 2,
        scopes: ["core", "hook"],
      },
    });
  });

  it("TV-1 ingests a body_root with an entry_file and returns body_hash/classification", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "SKILL.md"), "---\ndescription: demo\n---\nUse this skill to demo hashing.\n");

    await expect(
      handleRequest({
        op: "ingest",
        input: { kind: "skill", body_root: dir, entry_file: "SKILL.md" },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        classification: "single-file",
        body_hash: TV1_BODY_HASH,
        publisher_declared: true,
      },
    });
  });

  it("TV-9 ingests a publisher_section form and returns canonical bytes plus metadata_hash", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "command",
          publisher_section: {
            kind: "command",
            id: VALID_UUID_V4,
            display_name: "Review PR",
            version: "1.2.0",
          },
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        publisher_section: {
          kind: "command",
          id: VALID_UUID_V4,
          display_name: "Review PR",
          version: "1.2.0",
        },
        canonical_bytes:
          '{"display_name":"Review PR","id":"f47ac10b-58cc-4372-a567-0e02b2c3d479","kind":"command","version":"1.2.0"}',
        metadata_hash: "ceb0cf9212c530e85444020aeb3cbae8865fdc16d91ee63fe6f5cb374d67b5c6",
      },
    });
  });

  it("TV-L2-b ingests an authored hook sidecar with envelope-only publisher_section", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "hook",
          sidecar: {
            kind: "hook",
            id: VALID_UUID_V4,
            display_name: "Guard Write",
            pack_id: "11111111-1111-4111-8111-111111111111",
            hook: {
              event: "before_tool_execute",
              handlers: [{ type: "command", scripts: [{ type: "inline", content: "#!/bin/sh\nexit 0\n" }] }],
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        publisher_section: {
          kind: "hook",
          id: VALID_UUID_V4,
          display_name: "Guard Write",
          pack_id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
  });

  it("TV-L2-f ingests pack manifests and returns conflict diagnostics", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "pack",
          manifests: [
            { source: "package.json", name: "superpowers" },
            { source: "gemini-extension.json", name: "super-powers" },
          ],
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        canonical_source: "package.json",
        canonical_display_name: "superpowers",
        diagnostics: [
          {
            id: "acif.publisher.pack_source_conflict",
            params: {
              sources: ["package.json", "gemini-extension.json"],
              values: ["superpowers", "super-powers"],
              names_sources: ["package.json", "gemini-extension.json"],
              names_values: ["superpowers", "super-powers"],
            },
          },
        ],
      },
    });
  });

  it("TV-6 transports envelope non-conformance as a verdict with params", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "skill",
          item_record: { kind: "skill", effective_version: "3.0.0" },
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        conformant: false,
        reason: "acif.envelope.forbidden_field",
        params: { field: "effective_version" },
      },
    });
  });

  it("TV-6 transports sidecar envelope non-conformance as a verdict with params", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "skill",
          sidecar: { kind: "skill", effective_version: "3.0.0" },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        conformant: false,
        reason: "acif.envelope.forbidden_field",
        params: { field: "effective_version" },
      },
    });
  });

  it("TV-8 validates a pack-less sidecar item as conformant and installable", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "rule",
          sidecar: {
            publisher_section: { kind: "rule", id: VALID_UUID_V4, display_name: "Demo" },
            registry_section: {},
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        conformant: true,
        installable: true,
      },
    });
  });

  it("TV-11 transports sidecar envelope field validation verdicts", async () => {
    const cases: readonly [unknown, string][] = [
      [{ kind: "Skill", id: VALID_UUID_V4, display_name: "Demo" }, "acif.envelope.kind_invalid"],
      [{ kind: "skill", id: "not-a-uuid", display_name: "Demo" }, "acif.envelope.id_invalid"],
      [{ kind: "skill", id: VALID_UUID_V4, display_name: "Demo", version: "1.0" }, "acif.envelope.version_invalid"],
      [
        { kind: "skill", id: VALID_UUID_V4, display_name: "Demo", license: { spdx: "MIT License" } },
        "acif.envelope.license_spdx_invalid",
      ],
    ];

    for (const [sidecar, reason] of cases) {
      await expect(
        handleRequest({
          op: "ingest",
          input: { kind: "skill", sidecar },
        }),
      ).resolves.toMatchObject({
        ok: true,
        result: {
          conformant: false,
          reason,
        },
      });
    }
  });

  it("TV-13 rejects a symlink body as an error response", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "SKILL.md"), "Prose.\n");

    try {
      await symlink("/etc/passwd", join(dir, "scripts", "link.sh"));
    } catch {
      return;
    }

    await expect(
      handleRequest({
        op: "ingest",
        input: { kind: "skill", body_root: dir, entry_file: "SKILL.md" },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "acif.body.symlink",
      diagnostics: [
        {
          id: "acif.body.symlink",
          params: {
            path: "scripts/link.sh",
          },
        },
      ],
    });
  });

  it("TV-3 derives the pinned inferred_pack_id", async () => {
    await expect(
      handleRequest({
        op: "derive_pack_id",
        input: {
          namespace: "93516344-00e5-419b-a230-6e8b1d02f87d",
          canonical_repository_url: "https://github.com/obra/superpowers",
          canonical_display_name: "superpowers",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: { inferred_pack_id: "d932cd6d-1c14-527d-b2e7-185c717b7a0d" },
    });
  });

  it("TV-4 resolves declared pack membership before inferred membership", async () => {
    await expect(
      handleRequest({
        op: "resolve_pack",
        input: {
          item: {
            publisher_section: { pack_id: "11111111-1111-4111-8111-111111111111" },
            registry_section: { inferred_pack_id: "22222222-2222-5222-8222-222222222222" },
          },
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        pack_resolution: "declared",
        install: "proceed",
        member_of: "11111111-1111-4111-8111-111111111111",
      },
    });
  });

  it("TV-HOOK-c evaluates an unknown requires key as unknown and install-refusing", async () => {
    await expect(
      handleRequest({
        op: "evaluate_requires",
        input: {
          item_requires: { gpu_access: true },
          consumer_recognizes: [],
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        evaluation: "unknown",
        install: "refuse-unless-operator-opt-in",
        unknown_keys: ["gpu_access"],
      },
    });
  });

  it("TV-HOOK-adapter-ingest ingests a hook sidecar and computes body_hash", async () => {
    const sidecar = {
      kind: "hook",
      id: VALID_UUID_V4,
      display_name: "Session Hook",
      version: "0.1.0",
      hook: {
        event: "session_start",
        handlers: [
          {
            type: "command",
            scripts: [{ type: "inline", content: "echo hello" }]
          }
        ]
      }
    };

    const res = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        sidecar
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        conformant: true,
        body_hash: expect.any(String)
      }
    });
  });

  it("TV-HOOK-adapter-ingest-config ingests a provider config and canonicalizes it", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "win.bat"), "@echo off");
    await writeFile(join(dir, "linux.sh"), "#!/bin/sh");

    const res = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        body_root: dir,
        context: { event: "PreToolUse" },
        provider_config: {
          provider: "per-os-key-map-provider",
          path: "hooks.json",
          content: {
            windows: "win.bat",
            linux: "linux.sh"
          }
        }
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        canonical: {
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { path: "linux.sh", os: ["linux"] },
                { path: "win.bat", os: ["windows"] }
              ]
            }
          ]
        },
        body_hash: expect.any(String)
      }
    });
  });

  it("TV-HOOK-adapter-project projects os_coverage and derived_capabilities", async () => {
    const item = {
      kind: "hook",
      hook: {
        event: "session_start",
        handlers: [
          {
            type: "command",
            scripts: [
              { path: "win.bat", os: ["windows"] },
              { path: "linux.sh" }
            ]
          }
        ]
      }
    };

    // os_coverage
    const res1 = await handleRequest({
      op: "project",
      input: {
        item,
        projection: "os_coverage"
      }
    });

    expect(res1).toEqual({
      ok: true,
      result: {
        projection: {
          derivable: true,
          os: ["windows"],
          arch: [],
          unconstrained: true,
          os_divergent: true,
          provenance: "declared"
        }
      }
    });

    // derived_capabilities
    const res2 = await handleRequest({
      op: "project",
      input: {
        item,
        projection: "derived_capabilities"
      }
    });

    expect(res2).toEqual({
      ok: true,
      result: {
        derived_capabilities: {
          handler_types: true,
          matcher_patterns: false,
          async_execution: false
        }
      }
    });
  });

  it("TV-HOOK-adapter-render renders a hook to provider format", async () => {
    const canonical = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "win.bat", os: ["windows"] },
            { path: "linux.sh" }
          ]
        }
      ]
    };

    const res = await handleRequest({
      op: "render",
      input: {
        canonical,
        target: "claude-code"
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        output: expect.any(String),
        lossy: [],
        diagnostics: [
          { id: "acif.hook.platform_override_dropped" }
        ]
      }
    });
  });

  it("TV-HOOK-adapter-evaluate-install evaluates install rules", async () => {
    const item = {
      kind: "hook",
      hook: {
        event: "session_start",
        blocking: true,
        handlers: [
          {
            type: "command",
            scripts: [
              { path: "win.bat", os: ["windows"] }
            ]
          }
        ]
      }
    };

    const res = await handleRequest({
      op: "evaluate_install",
      input: {
        item,
        install_target_os: "linux"
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        install: "refuse-unless-operator-opt-in",
        diagnostics: [
          { id: "acif.hook.script_no_platform_match", params: { os: "linux" } }
        ]
      }
    });
  });

  it("TV-HOOK-adapter-bare-ingest ingests a BARE hook block and validates correctly", async () => {
    const res = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        sidecar: {
          event: "session_start",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "inline", content: "#!/bin/sh\nexit 0\n" }
              ]
            }
          ]
        }
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        conformant: true,
        canonical: {
          event: "session_start",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "inline", content: "#!/bin/sh\nexit 0\n" }
              ]
            }
          ]
        }
      }
    });
  });

  it("TV-HOOK-adapter-script-selection evaluates script selection projection", async () => {
    const res = await handleRequest({
      op: "project",
      input: {
        projection: "script_selection",
        targets: ["windows", "linux", "darwin"],
        item: {
          kind: "hook",
          hook: {
            event: "session_start",
            handlers: [
              {
                type: "command",
                scripts: [
                  { path: "win.bat", os: ["windows"] },
                  { path: "linux.sh", os: ["linux"] }
                ]
              }
            ]
          }
        }
      }
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        selection: {
          windows: "win.bat",
          linux: "linux.sh",
          darwin: "none"
        },
        diagnostics: [
          {
            id: "acif.hook.script_no_platform_match",
            params: { os: "darwin" }
          }
        ]
      }
    });
  });

  it("TV-HOOK-adapter-render-per-os-key-map-provider renders to provider and roundtrips", async () => {
    const canonical = {
      event: "before_tool_execute",
      handlers: [
        {
          type: "command",
          scripts: [
            { path: "win.bat", os: ["windows"] },
            { path: "linux.sh", os: ["linux"] },
            { path: "mac.sh", os: ["darwin"] }
          ]
        }
      ]
    };

    const resRender = await handleRequest({
      op: "render",
      input: {
        canonical,
        target: "per-os-key-map-provider"
      }
    });

    expect(resRender).toMatchObject({
      ok: true,
      result: {
        output: expect.any(String)
      }
    });

    const parsedOutput = JSON.parse((resRender as any).result.output as string);
    expect(parsedOutput).toEqual({
      windows: "win.bat",
      linux: "linux.sh",
      osx: "mac.sh"
    });

    // Round-trip ingest
    const dir = await tempDir();
    await writeFile(join(dir, "win.bat"), "@echo off");
    await writeFile(join(dir, "linux.sh"), "#!/bin/sh");
    await writeFile(join(dir, "mac.sh"), "#!/bin/sh");

    const resIngest = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        body_root: dir,
        context: { event: "PreToolUse" },
        provider_config: {
          provider: "per-os-key-map-provider",
          path: "hooks.json",
          content: parsedOutput
        }
      }
    });

    expect(resIngest).toMatchObject({
      ok: true,
      result: {
        canonical: {
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { path: "mac.sh", os: ["darwin"] },
                { path: "linux.sh", os: ["linux"] },
                { path: "win.bat", os: ["windows"] }
              ]
            }
          ]
        }
      }
    });
  });

  it("resolves provider_config content from body_root when content is missing", async () => {
    const dir = await tempDir();
    const configContent = {
      windows: "win.bat",
      linux: "linux.sh",
    };
    await writeFile(join(dir, "hooks.json"), JSON.stringify(configContent));
    await writeFile(join(dir, "win.bat"), "@echo off");
    await writeFile(join(dir, "linux.sh"), "#!/bin/sh");

    const res = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        body_root: dir,
        context: { event: "PreToolUse" },
        provider_config: {
          provider: "per-os-key-map-provider",
          path: "hooks.json",
        },
      },
    });

    expect(res).toMatchObject({
      ok: true,
      result: {
        canonical: {
          event: "before_tool_execute",
          handlers: [
            {
              type: "command",
              scripts: [
                { path: "linux.sh", os: ["linux"] },
                { path: "win.bat", os: ["windows"] }
              ]
            }
          ]
        },
        body_hash: expect.any(String)
      }
    });
  });

  it("TV-HOOK-adapter-missing-body_root-no-error omits body_hash if file-type scripts exist and body_root is absent", async () => {
    // 1. Hook with file-type script and no body_root -> should omit body_hash and not error
    const resFile = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        sidecar: {
          event: "session_start",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "file", path: "scripts/start.sh", os: ["linux"] }
              ]
            }
          ]
        }
      }
    });

    expect(resFile).toMatchObject({
      ok: true,
      result: {
        conformant: true,
        canonical: {
          event: "session_start"
        }
      }
    });
    expect((resFile as any).result.body_hash).toBeUndefined();

    // 2. Hook with inline-only scripts and no body_root -> should return body_hash
    const resInline = await handleRequest({
      op: "ingest",
      input: {
        kind: "hook",
        sidecar: {
          event: "session_start",
          handlers: [
            {
              type: "command",
              scripts: [
                { type: "inline", content: "echo 'hello'", os: ["linux"] }
              ]
            }
          ]
        }
      }
    });

    expect(resInline).toMatchObject({
      ok: true,
      result: {
        conformant: true,
        canonical: {
          event: "session_start"
        },
        body_hash: expect.any(String)
      }
    });
  });

  it("returns unsupported for an unserved request form", async () => {
    await expect(
      handleRequest({
        op: "ingest",
        input: {
          kind: "agent",
          provider_config: {
            provider: "claude-code",
            path: "agent.md",
            content: { tools: ["Read", "Task"] },
          },
        },
      }),
    ).resolves.toEqual({ unsupported: true });
  });

  it("routes malformed requests through the reserved adapter error channel", async () => {
    await expect(handleRequest({ input: {} })).resolves.toEqual({
      ok: false,
      error: "adapter: malformed request: op must be a string",
      diagnostics: [],
    });
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "acif-adapter-"));
  tempDirs.push(dir);
  return dir;
}
