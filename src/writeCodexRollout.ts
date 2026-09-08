import { promises as fs } from "node:fs";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import { v7 as uuidv7 } from "uuid";

import { upsertStateDbThread } from "./codexStateDb.js";
import { buildSessionFilePath } from "./paths.js";
import {
  type WriteCodexRolloutOptions,
  type WriteCodexRolloutResult,
} from "./types.js";

interface RolloutLine {
  timestamp: string;
  ordinal: number;
  type: string;
  payload: unknown;
}

export function buildCodexRolloutLines(
  options: Omit<WriteCodexRolloutOptions, "codexHome">,
): { threadId: string; startedAt: Date; lines: RolloutLine[] } {
  const threadId = options.threadId ?? uuidv7();
  const startedAt = options.createdAt ?? options.now ?? new Date();
  const lines: RolloutLine[] = [];
  let lastTimestamp = startedAt.getTime();

  const pushLine = (timestamp: Date, type: string, payload: unknown): void => {
    // Codex rebuilds history in file order; keep timestamps monotonic.
    const clamped = new Date(Math.max(lastTimestamp, timestamp.getTime()));
    lastTimestamp = clamped.getTime();
    lines.push({
      timestamp: clamped.toISOString(),
      ordinal: lines.length,
      type,
      payload,
    });
  };

  pushLine(startedAt, "session_meta", {
    session_id: threadId,
    id: threadId,
    timestamp: startedAt.toISOString(),
    cwd: options.cwd,
    originator: "chatgpt2codex",
    cli_version: `chatgpt2codex/${options.toolVersion}`,
    source: "cli",
    thread_source: "user",
    model_provider: "openai",
  });

  options.messages.forEach((message, index) => {
    const timestamp = message.createdAt ?? offsetDate(startedAt, index + 1);

    // Mirror the line order Codex itself writes: response_item then
    // user_message event for user turns, agent_message event then
    // response_item for assistant turns.
    if (message.role === "user") {
      pushLine(timestamp, "response_item", {
        type: "message",
        id: `msg_${uuidv7()}`,
        role: "user",
        content: [{ type: "input_text", text: message.text }],
      });
      pushLine(timestamp, "event_msg", {
        type: "user_message",
        message: message.text,
        images: [],
        local_images: [],
        audio: [],
        local_audio: [],
        text_elements: [],
      });
    } else {
      pushLine(timestamp, "event_msg", {
        type: "agent_message",
        message: message.text,
        phase: "final_answer",
        memory_citation: null,
      });
      pushLine(timestamp, "response_item", {
        type: "message",
        id: `msg_${uuidv7()}`,
        role: "assistant",
        content: [{ type: "output_text", text: message.text }],
        phase: "final_answer",
      });
    }
  });

  return { threadId, startedAt, lines };
}

export async function writeCodexRollout(
  options: WriteCodexRolloutOptions,
): Promise<WriteCodexRolloutResult> {
  const { threadId, startedAt, lines } = buildCodexRolloutLines(options);
  const { dirPath, filePath } = buildSessionFilePath(
    options.codexHome,
    startedAt,
    threadId,
  );

  await fs.mkdir(dirPath, { recursive: true });
  const body = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  await writeFileAtomic(filePath, body, { encoding: "utf8", mode: 0o600 });

  for (const line of body.trimEnd().split("\n")) {
    JSON.parse(line);
  }

  const sessionIndexPath = path.join(options.codexHome, "session_index.jsonl");
  await appendSessionIndex(sessionIndexPath, {
    id: threadId,
    title: options.title,
    updatedAt: options.updatedAt ?? options.now ?? new Date(),
  });

  let stateDbWritten: boolean | undefined;
  if (options.writeStateDb !== false) {
    stateDbWritten = await upsertStateDbThread({
      threadId,
      codexHome: options.codexHome,
      rolloutPath: filePath,
      cwd: options.cwd,
      title: options.title,
      messages: options.messages,
      toolVersion: options.toolVersion,
      createdAt: startedAt,
      updatedAt: options.now ?? new Date(),
      modelSlug: options.modelSlug,
    });
  }

  return {
    threadId,
    filePath,
    sessionIndexPath,
    lineCount: lines.length,
    stateDbWritten,
  };
}

async function appendSessionIndex(
  filePath: string,
  entry: { id: string; title: string; updatedAt: Date },
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(
    filePath,
    `${JSON.stringify({
      id: entry.id,
      thread_name: entry.title,
      updated_at: entry.updatedAt.toISOString(),
    })}\n`,
    "utf8",
  );
}

function offsetDate(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
