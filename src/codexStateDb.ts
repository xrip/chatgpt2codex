import { access, constants, unlink } from "node:fs/promises";
import path from "node:path";

import type { DatabaseSync } from "node:sqlite";
import type { ExistingCodexSession, NormalizedMessage } from "./types.js";

export interface StateDbThreadInput {
  threadId: string;
  codexHome: string;
  rolloutPath: string;
  cwd: string;
  title: string;
  messages: NormalizedMessage[];
  toolVersion: string;
  createdAt: Date;
  updatedAt: Date;
  modelSlug?: string;
}

interface ThreadRow {
  id: string;
  cwd: string;
  rollout_path: string;
  updated_at?: number;
  archived?: number;
}

type SqliteModule = typeof import("node:sqlite");

const REQUIRED_THREAD_COLUMNS = [
  "id",
  "rollout_path",
  "created_at",
  "updated_at",
  "recency_at",
  "created_at_ms",
  "updated_at_ms",
  "recency_at_ms",
  "source",
  "thread_source",
  "agent_nickname",
  "agent_role",
  "agent_path",
  "model_provider",
  "model",
  "reasoning_effort",
  "cwd",
  "cli_version",
  "title",
  "preview",
  "sandbox_policy",
  "approval_mode",
  "tokens_used",
  "has_user_event",
  "first_user_message",
  "archived",
  "archived_at",
  "git_sha",
  "git_branch",
  "git_origin_url",
  "memory_mode",
] as const;

export async function findStateDbSessionByCwd(options: {
  codexHome: string;
  cwd: string;
  includeArchived?: boolean;
}): Promise<ExistingCodexSession | undefined> {
  return withStateDb(options.codexHome, true, (db) => {
    if (!hasRequiredThreadColumns(db, ["id", "cwd", "rollout_path", "updated_at", "archived"])) {
      return undefined;
    }

    const row = db
      .prepare(
        `SELECT id, cwd, rollout_path, updated_at, archived
         FROM threads
         WHERE cwd = ? AND archived ${options.includeArchived ? "IN (0, 1)" : "= 0"}
         ORDER BY updated_at_ms DESC, id DESC
         LIMIT 1`,
      )
      .get(options.cwd) as ThreadRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      cwd: row.cwd,
      filePath: row.rollout_path,
      timestamp:
        typeof row.updated_at === "number"
          ? new Date(row.updated_at * 1000).toISOString()
          : undefined,
      source: "state_db",
      archived: row.archived === 1,
    };
  });
}

export async function deleteStateDbSessionById(
  codexHome: string,
  threadId: string,
): Promise<void> {
  await withStateDb(codexHome, false, (db) => {
    if (!hasRequiredThreadColumns(db, ["id"])) {
      return;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM thread_dynamic_tools WHERE thread_id = ?").run(threadId);
      db.prepare("DELETE FROM thread_spawn_edges WHERE child_thread_id = ? OR parent_thread_id = ?")
        .run(threadId, threadId);
      db.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}

export async function upsertStateDbThread(
  input: StateDbThreadInput,
): Promise<boolean> {
  const written = await withStateDb(input.codexHome, false, (db) => {
    if (!hasRequiredThreadColumns(db, REQUIRED_THREAD_COLUMNS)) {
      return false;
    }

    const firstUserMessage =
      input.messages.find((message) => message.role === "user")?.text ??
      input.messages[0]?.text ??
      input.title;
    const preview = firstUserMessage.trim() || input.title;
    const createdAtMs = input.createdAt.getTime();
    const updatedAtMs = input.updatedAt.getTime();

    db.prepare(
      `INSERT INTO threads (
        id,
        rollout_path,
        created_at,
        updated_at,
        recency_at,
        created_at_ms,
        updated_at_ms,
        recency_at_ms,
        source,
        thread_source,
        agent_nickname,
        agent_role,
        agent_path,
        model_provider,
        model,
        reasoning_effort,
        cwd,
        cli_version,
        title,
        preview,
        sandbox_policy,
        approval_mode,
        tokens_used,
        has_user_event,
        first_user_message,
        archived,
        archived_at,
        git_sha,
        git_branch,
        git_origin_url,
        memory_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        rollout_path = excluded.rollout_path,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        recency_at = excluded.recency_at,
        created_at_ms = excluded.created_at_ms,
        updated_at_ms = excluded.updated_at_ms,
        recency_at_ms = excluded.recency_at_ms,
        source = excluded.source,
        thread_source = excluded.thread_source,
        agent_nickname = excluded.agent_nickname,
        agent_role = excluded.agent_role,
        agent_path = excluded.agent_path,
        model_provider = excluded.model_provider,
        model = excluded.model,
        reasoning_effort = excluded.reasoning_effort,
        cwd = excluded.cwd,
        cli_version = excluded.cli_version,
        title = excluded.title,
        preview = excluded.preview,
        sandbox_policy = excluded.sandbox_policy,
        approval_mode = excluded.approval_mode,
        tokens_used = excluded.tokens_used,
        has_user_event = excluded.has_user_event,
        first_user_message = excluded.first_user_message,
        archived = 0,
        archived_at = NULL,
        git_sha = COALESCE(threads.git_sha, excluded.git_sha),
        git_branch = COALESCE(threads.git_branch, excluded.git_branch),
        git_origin_url = COALESCE(threads.git_origin_url, excluded.git_origin_url),
        memory_mode = excluded.memory_mode`,
    )
      .run(
        input.threadId,
        input.rolloutPath,
        epochSeconds(input.createdAt),
        epochSeconds(input.updatedAt),
        epochSeconds(input.updatedAt),
        createdAtMs,
        updatedAtMs,
        updatedAtMs,
        "cli",
        "user",
        null,
        null,
        null,
        "openai",
        input.modelSlug ?? null,
        null,
        input.cwd,
        `chatgpt2codex/${input.toolVersion}`,
        input.title,
        preview,
        JSON.stringify({ type: "read-only" }),
        "on-request",
        0,
        firstUserMessage ? 1 : 0,
        firstUserMessage,
        0,
        null,
        null,
        null,
        null,
        "enabled",
      );

    return true;
  });

  return written ?? false;
}

export async function removeExistingCodexSession(
  session: ExistingCodexSession,
  codexHome: string,
): Promise<void> {
  if (session.id) {
    await deleteStateDbSessionById(codexHome, session.id);
  }

  if (session.filePath) {
    await unlink(session.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

export function stateDbPath(codexHome: string): string {
  return path.join(codexHome, "state_5.sqlite");
}

async function withStateDb<T>(
  codexHome: string,
  _readOnly: boolean,
  callback: (db: DatabaseSync) => T,
): Promise<T | undefined> {
  const sqlite = await loadSqlite();
  if (!sqlite) {
    return undefined;
  }

  let db: DatabaseSync | undefined;
  try {
    const dbPath = stateDbPath(codexHome);
    await access(dbPath, constants.F_OK).catch(() => {
      throw new StateDbMissingError();
    });
    db = new sqlite.DatabaseSync(dbPath);
    return callback(db);
  } catch (error) {
    if (error instanceof StateDbMissingError) {
      return undefined;
    }
    throw error;
  } finally {
    db?.close();
  }
}

async function loadSqlite(): Promise<SqliteModule | undefined> {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
}

function hasRequiredThreadColumns(
  db: DatabaseSync,
  requiredColumns: readonly string[],
): boolean {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(threads)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  return requiredColumns.every((column) => columns.has(column));
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

class StateDbMissingError extends Error {}
