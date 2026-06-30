import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import fg from "fast-glob";

import {
  canonicalizePathLoose,
  normalizePathForCompare,
} from "./paths.js";
import { isRecord, maybeString, type ExistingCodexSession } from "./types.js";

export interface FindExistingCodexSessionOptions {
  codexHome: string;
  cwd: string;
  includeArchived?: boolean;
}

export async function findExistingCodexSession(
  options: FindExistingCodexSessionOptions,
): Promise<ExistingCodexSession | undefined> {
  const targetCwd = await canonicalizePathLoose(options.cwd);
  const patterns = ["sessions/**/rollout-*.jsonl"];
  if (options.includeArchived) {
    patterns.push("archived_sessions/**/rollout-*.jsonl");
  }

  const files = await fg(patterns, {
    cwd: options.codexHome,
    absolute: true,
    onlyFiles: true,
    dot: true,
    unique: true,
  });

  for (const filePath of files.sort()) {
    const session = await readSessionMeta(filePath);
    if (!session?.cwd) {
      continue;
    }

    const sessionCwd = await canonicalizePathLoose(session.cwd);
    if (normalizePathForCompare(sessionCwd) === targetCwd) {
      return {
        ...session,
        filePath,
      };
    }
  }

  return undefined;
}

async function readSessionMeta(
  filePath: string,
): Promise<Omit<ExistingCodexSession, "filePath"> | undefined> {
  const firstLine = await readFirstLine(filePath).catch(() => undefined);
  if (!firstLine) {
    return undefined;
  }

  let line: unknown;
  try {
    line = JSON.parse(firstLine) as unknown;
  } catch {
    return undefined;
  }

  if (!isRecord(line) || line.type !== "session_meta" || !isRecord(line.payload)) {
    return undefined;
  }

  const cwd = maybeString(line.payload.cwd);
  if (!cwd) {
    return undefined;
  }

  return {
    id: maybeString(line.payload.id) ?? maybeString(line.payload.session_id),
    cwd,
    timestamp: maybeString(line.payload.timestamp) ?? maybeString(line.timestamp),
  };
}

async function readFirstLine(filePath: string): Promise<string | undefined> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      return line;
    }
    return undefined;
  } finally {
    lines.close();
    stream.destroy();
  }
}
