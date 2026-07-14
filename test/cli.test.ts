import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashFile } from "../src/body_hash";
import { runCli } from "../src/cli";

const VALID_UUID_V4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TV1_BODY_HASH = "916e570331167c16f8112573d1b6020c134cc3d4019e8011693676d019b88ffe";
const TV_SKILL_G_MULTI_BODY_HASH = "fef9a3e615ab4d41c1a990908bf9a3e5b47f70a73eaa16fc7e1578c9f4ab60df";

interface CliRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runCli validate", () => {
  it("prints an ok JSON result for a conforming record", async () => {
    const file = await tempJsonFile({
      kind: "skill",
      id: VALID_UUID_V4,
      skill: { requires: {} },
    });

    const result = await runCaptured(["validate", file]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({ ok: true, rejections: [] });
  });

  it("prints envelope and requires rejections for a rejected item record", async () => {
    const file = await tempJsonFile({
      kind: "skill",
      id: "not-a-uuid",
      skill: { requires: { handler_types: ["command"] } },
    });

    const result = await runCaptured(["validate", file]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      ok: false,
      rejections: [
        { id: "acif.envelope.id_invalid" },
        { id: "acif.requires.orphan_key", params: { key: "handler_types" } },
      ],
    });
  });

  it("exits 2 and writes stderr for JSON parse errors", async () => {
    const dir = await tempDir();
    const file = join(dir, "record.json");
    await writeFile(file, "{not json");

    const result = await runCaptured(["validate", file]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Failed to parse JSON");
  });
});

describe("runCli hash body", () => {
  it("hashes a single-file body with TV-1's pinned value", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "SKILL.md"), "---\ndescription: demo\n---\nUse this skill to demo hashing.\n");

    const result = await runCaptured(["hash", "body", "--dir", dir, "--entry", "SKILL.md"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      algorithm: "sha256",
      classification: "single-file",
      value: TV1_BODY_HASH,
    });
  });

  it("hashes a multi-file body with a pinned bundled-resource vector", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "SKILL.md"), "Use this to demo classification.\n");
    await writeFile(join(dir, "scripts", "run.sh"), "#!/bin/sh\necho hi\n");

    const result = await runCaptured(["hash", "body", "--dir", dir, "--entry", "SKILL.md"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      algorithm: "sha256",
      classification: "multi-file",
      value: TV_SKILL_G_MULTI_BODY_HASH,
    });
  });
});

describe("runCli hash metadata", () => {
  it("hashes TV-2 metadata from a publisher_section JSON file", async () => {
    const file = await tempJsonFile({
      kind: "skill",
      id: VALID_UUID_V4,
      display_name: "Demo Skill",
    });

    const result = await runCaptured(["hash", "metadata", file]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      algorithm: "sha256",
      value: "b68bf2e4cbd6b9123d23de684498157adeaf4915e65435a95a556ac27ec50316",
    });
  });

  it("hashes TV-9 metadata from a publisher_section JSON file", async () => {
    const file = await tempJsonFile({
      kind: "command",
      id: VALID_UUID_V4,
      display_name: "Review PR",
      version: "1.2.0",
    });

    const result = await runCaptured(["hash", "metadata", file]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      algorithm: "sha256",
      value: "ceb0cf9212c530e85444020aeb3cbae8865fdc16d91ee63fe6f5cb374d67b5c6",
    });
  });
});

describe("runCli ingest", () => {
  it("prints classification, body_hash, and sorted manifest entries", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "SKILL.md"), "Use this to demo classification.\n");
    await writeFile(join(dir, "scripts", "run.sh"), "#!/bin/sh\necho hi\n");

    const result = await runCaptured(["ingest", "--dir", dir, "--entry", "SKILL.md"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      classification: "multi-file",
      body_hash: {
        algorithm: "sha256",
        value: TV_SKILL_G_MULTI_BODY_HASH,
      },
      manifest: [
        {
          path: "SKILL.md",
          hash: hashFile("SKILL.md", "Use this to demo classification.\n"),
        },
        {
          path: "scripts/run.sh",
          hash: hashFile("scripts/run.sh", "#!/bin/sh\necho hi\n"),
        },
      ],
    });
  });

  it("rejects symbolic links discovered by lstat during the walk", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "SKILL.md"), "Use this skill.\n");

    try {
      await symlink("SKILL.md", join(dir, "link.md"));
    } catch {
      return;
    }

    const result = await runCaptured(["ingest", "--dir", dir, "--entry", "SKILL.md"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(parseStdoutJson(result)).toEqual({
      ok: false,
      rejections: [{ id: "acif.body.symlink", params: { path: "link.md" } }],
    });
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "acif-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function tempJsonFile(value: unknown): Promise<string> {
  const dir = await tempDir();
  const file = join(dir, "input.json");
  await writeFile(file, `${JSON.stringify(value)}\n`);
  return file;
}

async function runCaptured(argv: string[]): Promise<CliRunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout.push(textFromChunk(chunk));
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderr.push(textFromChunk(chunk));
    return true;
  };

  try {
    const code = await runCli(argv);
    return { code, stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function parseStdoutJson(result: CliRunResult): unknown {
  expect(result.stdout.endsWith("\n")).toBe(true);
  return JSON.parse(result.stdout);
}

function textFromChunk(chunk: string | Uint8Array): string {
  return typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
}
