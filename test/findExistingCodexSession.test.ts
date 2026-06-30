import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findExistingCodexSession } from "../src/findExistingCodexSession.js";

describe("findExistingCodexSession", () => {
  it("finds a rollout whose session_meta cwd matches the target cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-"));
    const codexHome = path.join(root, ".codex");
    const cwd = path.join(root, "project");
    const sessionDir = path.join(codexHome, "sessions", "2026", "06", "30");
    await mkdir(cwd, { recursive: true });
    await mkdir(sessionDir, { recursive: true });

    const rolloutPath = path.join(
      sessionDir,
      "rollout-2026-06-30T10-00-00-019f16dc-8b54-7d52-af4e-4b86b7ce0460.jsonl",
    );
    await writeFile(
      rolloutPath,
      `${JSON.stringify({
        timestamp: "2026-06-30T03:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
          cwd,
        },
      })}\n`,
      "utf8",
    );

    const existing = await findExistingCodexSession({ codexHome, cwd });

    expect(existing).toMatchObject({
      id: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
      cwd,
      filePath: rolloutPath,
    });
  });

  it("ignores archived sessions unless requested", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-"));
    const codexHome = path.join(root, ".codex");
    const cwd = path.join(root, "project");
    const sessionDir = path.join(codexHome, "archived_sessions", "2026", "06", "30");
    await mkdir(cwd, { recursive: true });
    await mkdir(sessionDir, { recursive: true });

    await writeFile(
      path.join(
        sessionDir,
        "rollout-2026-06-30T10-00-00-019f16dc-8b54-7d52-af4e-4b86b7ce0460.jsonl",
      ),
      `${JSON.stringify({
        timestamp: "2026-06-30T03:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "archived",
          cwd,
        },
      })}\n`,
      "utf8",
    );

    await expect(findExistingCodexSession({ codexHome, cwd })).resolves.toBeUndefined();
    await expect(
      findExistingCodexSession({ codexHome, cwd, includeArchived: true }),
    ).resolves.toMatchObject({ id: "archived" });
  });
});
