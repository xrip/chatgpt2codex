import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function expandHome(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }

  return input;
}

export function resolveCodexHome(input?: string): string {
  return path.resolve(
    expandHome(input ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex")),
  );
}

export async function resolveTargetCwd(input?: string): Promise<string> {
  const target = path.resolve(expandHome(input ?? process.cwd()));
  const stat = await fs.stat(target).catch((error: unknown) => {
    throw new Error(`Target cwd does not exist: ${target}`, { cause: error });
  });

  if (!stat.isDirectory()) {
    throw new Error(`Target cwd is not a directory: ${target}`);
  }

  return fs.realpath(target);
}

export async function canonicalizePathLoose(input: string): Promise<string> {
  const resolved = path.resolve(expandHome(input));
  const canonical = await fs.realpath(resolved).catch(() => resolved);
  return normalizePathForCompare(canonical);
}

export function normalizePathForCompare(input: string): string {
  const normalized = path.normalize(path.resolve(input));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function buildSessionFilePath(
  codexHome: string,
  date: Date,
  threadId: string,
): { dirPath: string; filePath: string } {
  const parts = localDateParts(date);
  const dirPath = path.join(
    codexHome,
    "sessions",
    parts.year,
    parts.month,
    parts.day,
  );
  const filePath = path.join(
    dirPath,
    `rollout-${toCodexFilenameTimestamp(date)}-${threadId}.jsonl`,
  );

  return { dirPath, filePath };
}

export function toCodexFilenameTimestamp(date: Date): string {
  const parts = localDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}`;
}

function localDateParts(date: Date): Record<
  "year" | "month" | "day" | "hour" | "minute" | "second",
  string
> {
  return {
    year: String(date.getFullYear()).padStart(4, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
    hour: String(date.getHours()).padStart(2, "0"),
    minute: String(date.getMinutes()).padStart(2, "0"),
    second: String(date.getSeconds()).padStart(2, "0"),
  };
}
