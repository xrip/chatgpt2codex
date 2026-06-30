import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { makeSyntheticShareHtml } from "./syntheticShare.js";

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
});
