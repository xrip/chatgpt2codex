import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface TestThreadRow {
  id: string;
  rollout_path: string;
  cwd: string;
  source: string;
  title: string;
  preview: string;
  first_user_message: string;
  has_user_event: number;
  archived: number;
}

export async function createStateDb(codexHome: string): Promise<void> {
  await mkdir(codexHome, { recursive: true });
  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL,
        sandbox_policy TEXT NOT NULL,
        approval_mode TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        has_user_event INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        git_sha TEXT,
        git_branch TEXT,
        git_origin_url TEXT,
        cli_version TEXT NOT NULL DEFAULT '',
        first_user_message TEXT NOT NULL DEFAULT '',
        agent_nickname TEXT,
        agent_role TEXT,
        memory_mode TEXT NOT NULL DEFAULT 'enabled',
        model TEXT,
        reasoning_effort TEXT,
        agent_path TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        thread_source TEXT,
        preview TEXT NOT NULL DEFAULT '',
        recency_at INTEGER NOT NULL DEFAULT 0,
        recency_at_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE thread_dynamic_tools (
        thread_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        defer_loading INTEGER NOT NULL DEFAULT 0,
        namespace TEXT,
        PRIMARY KEY(thread_id, position)
      );
      CREATE TABLE thread_spawn_edges (
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL PRIMARY KEY,
        status TEXT NOT NULL
      );
    `);
  } finally {
    db.close();
  }
}

export function insertThreadRow(
  codexHome: string,
  row: {
    id: string;
    rolloutPath: string;
    cwd: string;
    source?: string;
    title?: string;
    preview?: string;
    archived?: number;
  },
): void {
  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    db.prepare(
      `INSERT INTO threads (
        id, rollout_path, created_at, updated_at, recency_at,
        created_at_ms, updated_at_ms, recency_at_ms,
        source, thread_source, model_provider, cwd, cli_version,
        title, preview, sandbox_policy, approval_mode, tokens_used,
        has_user_event, first_user_message, archived, archived_at, memory_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.rolloutPath,
      1,
      2,
      2,
      1000,
      2000,
      2000,
      row.source ?? "cli",
      "user",
      "openai",
      row.cwd,
      "test",
      row.title ?? "Existing",
      row.preview ?? "Existing preview",
      JSON.stringify({ type: "read-only" }),
      "on-request",
      0,
      1,
      row.preview ?? "Existing preview",
      row.archived ?? 0,
      row.archived ? 2 : null,
      "enabled",
    );
  } finally {
    db.close();
  }
}

export function readThreadRow(
  codexHome: string,
  id: string,
): TestThreadRow | undefined {
  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"), {
    readOnly: true,
  });
  try {
    return db
      .prepare(
        `SELECT id, rollout_path, cwd, source, title, preview, first_user_message,
                has_user_event, archived
         FROM threads
         WHERE id = ?`,
      )
      .get(id) as TestThreadRow | undefined;
  } finally {
    db.close();
  }
}

export function countThreadRows(codexHome: string): number {
  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"), {
    readOnly: true,
  });
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM threads").get() as {
      count: number;
    };
    return row.count;
  } finally {
    db.close();
  }
}
