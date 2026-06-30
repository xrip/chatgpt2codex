import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { makeSyntheticShareHtml } from "./syntheticShare.js";
import {
  countThreadRows,
  createStateDb,
  insertThreadRow,
  readThreadRow,
} from "./stateDbFixture.js";

const execFileAsync = promisify(execFile);

describe("cli", () => {
  it("does not write Codex files in dry-run mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-cli-"));
    const cwd = path.join(root, "project");
    const codexHome = path.join(root, ".codex");
    const preloadPath = path.join(root, "mock-fetch.mjs");

    await writeFile(
      preloadPath,
      [
        "globalThis.fetch = async () => new Response(",
        "  process.env.CHATGPT2CODEX_TEST_HTML,",
        "  { status: 200, headers: { 'content-type': 'text/html' } },",
        ");",
      ].join("\n"),
      "utf8",
    );
    await mkdir(cwd, { recursive: true });

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        preloadPath,
        path.resolve("dist/cli.js"),
        "https://chatgpt.com/share/test",
        "--dry-run",
        "--cwd",
        cwd,
        "--codex-home",
        codexHome,
      ],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          CHATGPT2CODEX_TEST_HTML: makeSyntheticShareHtml(),
          NO_COLOR: "1",
        },
      },
    );

    expect(stdout).toContain("Dry run: no files written");
    expect(stdout).toContain("Messages: 2");
    await expect(access(path.join(codexHome, "sessions"))).rejects.toThrow();
  });

  it("replaces an existing cwd session when --force is used", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-cli-"));
    const cwd = path.join(root, "project");
    const codexHome = path.join(root, ".codex");
    const preloadPath = path.join(root, "mock-fetch.mjs");
    const oldRolloutPath = path.join(codexHome, "sessions", "old.jsonl");

    await mkdir(path.dirname(oldRolloutPath), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await createStateDb(codexHome);
    await writeFile(oldRolloutPath, "old\n", "utf8");
    insertThreadRow(codexHome, {
      id: "old-thread",
      rolloutPath: oldRolloutPath,
      cwd,
    });

    await writeFile(
      preloadPath,
      [
        "globalThis.fetch = async () => new Response(",
        "  process.env.CHATGPT2CODEX_TEST_HTML,",
        "  { status: 200, headers: { 'content-type': 'text/html' } },",
        ");",
      ].join("\n"),
      "utf8",
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        preloadPath,
        path.resolve("dist/cli.js"),
        "https://chatgpt.com/share/test",
        "--force",
        "--cwd",
        cwd,
        "--codex-home",
        codexHome,
      ],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          CHATGPT2CODEX_TEST_HTML: makeSyntheticShareHtml(),
          NO_COLOR: "1",
        },
      },
    );

    expect(stdout).toContain("Replaced existing Codex session");
    await expect(access(oldRolloutPath)).rejects.toThrow();
    expect(countThreadRows(codexHome)).toBe(1);

    const threadId = /Thread: ([0-9a-f-]+)/.exec(stdout)?.[1];
    expect(threadId).toBeTruthy();
    const row = readThreadRow(codexHome, threadId ?? "");
    expect(row).toMatchObject({
      cwd,
      source: "cli",
      title: "Synthetic Chat",
      preview: "Hello Codex",
      first_user_message: "Hello Codex",
      archived: 0,
    });

    const rollout = await readFile(row?.rollout_path ?? "", "utf8");
    expect(rollout).toContain('"source":"cli"');
  });
});
