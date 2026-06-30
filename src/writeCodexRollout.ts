import { promises as fs } from "node:fs";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import { v7 as uuidv7 } from "uuid";

import { upsertStateDbThread } from "./codexStateDb.js";
import { buildSessionFilePath } from "./paths.js";
import {
  type NormalizedMessage,
  type WriteCodexRolloutOptions,
  type WriteCodexRolloutResult,
} from "./types.js";

interface RolloutLine {
  timestamp: string;
  type: string;
  payload: unknown;
}

export function buildCodexRolloutLines(
  options: Omit<WriteCodexRolloutOptions, "codexHome">,
): { threadId: string; startedAt: Date; lines: RolloutLine[] } {
  const threadId = options.threadId ?? uuidv7();
  const startedAt = options.createdAt ?? options.now ?? new Date();
  const lines: RolloutLine[] = [];

  lines.push({
    timestamp: startedAt.toISOString(),
    type: "session_meta",
    payload: {
      session_id: threadId,
      id: threadId,
      timestamp: startedAt.toISOString(),
      cwd: options.cwd,
      originator: "chatgpt2codex",
      cli_version: `chatgpt2codex/${options.toolVersion}`,
      source: "cli",
      thread_source: "user",
      model_provider: "openai",
    },
  });

  options.messages.forEach((message, index) => {
    const timestamp = message.createdAt ?? offsetDate(startedAt, index + 1);
    lines.push(buildResponseItemLine(message, timestamp));
    lines.push(buildEventMessageLine(message, timestamp));
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

  if (options.writeStateDb !== false) {
    await upsertStateDbThread({
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
  };
}

function buildResponseItemLine(
  message: NormalizedMessage,
  timestamp: Date,
): RolloutLine {
  return {
    timestamp: timestamp.toISOString(),
    type: "response_item",
    payload: {
      type: "message",
      role: message.role,
      content: [
        {
          type: message.role === "user" ? "input_text" : "output_text",
          text: message.text,
        },
      ],
    },
  };
}

function buildEventMessageLine(
  message: NormalizedMessage,
  timestamp: Date,
): RolloutLine {
  if (message.role === "user") {
    return {
      timestamp: timestamp.toISOString(),
      type: "event_msg",
      payload: {
        type: "user_message",
        message: message.text,
        images: null,
        image_details: null,
        local_images: [],
        local_image_details: [],
        text_elements: [],
      },
    };
  }

  return {
    timestamp: timestamp.toISOString(),
    type: "event_msg",
    payload: {
      type: "agent_message",
      message: message.text,
      phase: null,
      memory_citation: null,
    },
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
