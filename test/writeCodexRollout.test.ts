import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCodexRolloutLines,
  writeCodexRollout,
} from "../src/writeCodexRollout.js";
import { createStateDb, readThreadRow } from "./stateDbFixture.js";

describe("writeCodexRollout", () => {
  it("builds Codex response_item and event_msg lines", () => {
    const built = buildCodexRolloutLines({
      cwd: "/tmp/project",
      title: "Synthetic",
      toolVersion: "0.1.0",
      threadId: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
      now: new Date("2026-06-30T04:00:00.000Z"),
      messages: [
        {
          role: "user",
          text: "Hello",
        },
        {
          role: "assistant",
          text: "Hi",
        },
      ],
    });

    expect(built.lines).toMatchObject([
      {
        type: "session_meta",
        payload: {
          id: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
          cwd: "/tmp/project",
          source: "cli",
        },
      },
      {
        type: "response_item",
        payload: {
          role: "user",
          content: [{ type: "input_text", text: "Hello" }],
        },
      },
      {
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Hello",
        },
      },
      {
        type: "response_item",
        payload: {
          role: "assistant",
          content: [{ type: "output_text", text: "Hi" }],
        },
      },
      {
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Hi",
        },
      },
    ]);
  });

  it("writes rollout JSONL and a session index entry", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-"));
    const cwd = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-project-"));

    const result = await writeCodexRollout({
      codexHome,
      cwd,
      title: "Synthetic",
      toolVersion: "0.1.0",
      threadId: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
      now: new Date("2026-06-30T04:00:00.000Z"),
      updatedAt: new Date("2026-06-30T04:00:05.000Z"),
      messages: [
        {
          role: "user",
          text: "Hello",
        },
      ],
    });

    expect(result.lineCount).toBe(3);

    const rolloutLines = (await readFile(result.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });

    expect(rolloutLines.map((line) => line.type)).toEqual([
      "session_meta",
      "response_item",
      "event_msg",
    ]);

    const sessionIndex = await readFile(result.sessionIndexPath, "utf8");
    expect(sessionIndex.trim()).toBe(
      JSON.stringify({
        id: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
        thread_name: "Synthetic",
        updated_at: "2026-06-30T04:00:05.000Z",
      }),
    );
  });

  it("upserts Codex state_5.sqlite metadata for the resume picker", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-"));
    const cwd = await mkdtemp(path.join(tmpdir(), "chatgpt2codex-project-"));
    await createStateDb(codexHome);

    const result = await writeCodexRollout({
      codexHome,
      cwd,
      title: "Synthetic",
      toolVersion: "0.1.1",
      threadId: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
      now: new Date("2026-06-30T04:00:00.000Z"),
      modelSlug: "gpt-test",
      messages: [
        {
          role: "user",
          text: "Hello picker",
        },
      ],
    });

    expect(readThreadRow(codexHome, result.threadId)).toMatchObject({
      id: "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
      rollout_path: result.filePath,
      cwd,
      source: "cli",
      title: "Synthetic",
      preview: "Hello picker",
      first_user_message: "Hello picker",
      has_user_event: 1,
      archived: 0,
    });
  });
});
