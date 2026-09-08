#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import pc from "picocolors";

import { removeExistingCodexSession } from "./codexStateDb.js";
import { fetchShareHtml, parseShareUrl } from "./fetchShare.js";
import { findExistingCodexSession } from "./findExistingCodexSession.js";
import { parseChatGptShareHtml } from "./parseChatGptShare.js";
import { resolveCodexHome, resolveTargetCwd } from "./paths.js";
import { writeCodexRollout } from "./writeCodexRollout.js";

interface PackageJson {
  version: string;
}

interface CliOptions {
  cwd?: string;
  codexHome?: string;
  name?: string;
  dryRun?: boolean;
  includeArchived?: boolean;
  force?: boolean;
}

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as PackageJson;

const program = new Command()
  .name("chatgpt2codex")
  .description("Import a shared ChatGPT conversation into a local Codex CLI session.")
  .argument("<share-url>", "ChatGPT share URL, for example https://chatgpt.com/share/<id>")
  .option("-C, --cwd <dir>", "project directory for the imported Codex session")
  .option("--codex-home <dir>", "Codex home directory; defaults to $CODEX_HOME or ~/.codex")
  .option("--name <name>", "override the imported session title")
  .option("--dry-run", "parse and print what would be imported without writing files")
  .option("--include-archived", "also scan archived_sessions for cwd collisions")
  .option("--force", "replace an existing Codex session for the target cwd")
  .action(async (shareUrl: string, options: CliOptions) => {
    try {
      await runImport(shareUrl, options);
    } catch (error) {
      console.error(pc.red(formatError(error)));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

async function runImport(shareUrl: string, options: CliOptions): Promise<void> {
  parseShareUrl(shareUrl);

  const cwd = await resolveTargetCwd(options.cwd);
  const codexHome = resolveCodexHome(options.codexHome);

  const existing = await findExistingCodexSession({
    codexHome,
    cwd,
    includeArchived: options.includeArchived,
  });

  if (existing) {
    if (!options.force) {
      throw new Error(
        [
          `A Codex session already exists for ${cwd}.`,
          existing.id ? `Existing session: ${existing.id}` : undefined,
          `File: ${existing.filePath}`,
          "Use --force to replace it.",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (!options.dryRun) {
      await removeExistingCodexSession(existing, codexHome);
    }
  }

  const html = await fetchShareHtml(shareUrl);
  const parsed = parseChatGptShareHtml(html);
  const title = options.name ?? parsed.title;

  if (options.dryRun) {
    printDryRun({
      title,
      cwd,
      codexHome,
      messageCount: parsed.messages.length,
      userMessageCount: parsed.messages.filter((message) => message.role === "user")
        .length,
      assistantMessageCount: parsed.messages.filter(
        (message) => message.role === "assistant",
      ).length,
      model: parsed.modelTitle ?? parsed.modelSlug,
      conversationId: parsed.conversationId,
    });
    return;
  }

  const result = await writeCodexRollout({
    codexHome,
    cwd,
    title,
    messages: parsed.messages,
    conversationId: parsed.conversationId,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    modelSlug: parsed.modelSlug,
    toolVersion: packageJson.version,
  });

  console.log(pc.green("Imported ChatGPT share into Codex."));
  console.log(`Thread: ${result.threadId}`);
  console.log(`File: ${result.filePath}`);
  console.log(`Messages: ${parsed.messages.length}`);
  if (result.stateDbWritten === false) {
    console.warn(
      pc.yellow(
        "Warning: no sqlite engine available (node:sqlite or bun:sqlite), so the session was not added to state_5.sqlite and Codex may not list it.",
      ),
    );
  }
  if (existing && options.force) {
    console.log("Replaced existing Codex session for this cwd.");
  }
}

function printDryRun(summary: {
  title: string;
  cwd: string;
  codexHome: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  model?: string;
  conversationId?: string;
}): void {
  console.log(pc.bold("Dry run: no files written"));
  console.log(`Title: ${summary.title}`);
  console.log(`Cwd: ${summary.cwd}`);
  console.log(`Codex home: ${summary.codexHome}`);
  console.log(`Messages: ${summary.messageCount}`);
  console.log(`User messages: ${summary.userMessageCount}`);
  console.log(`Assistant messages: ${summary.assistantMessageCount}`);

  if (summary.model) {
    console.log(`Model: ${summary.model}`);
  }

  if (summary.conversationId) {
    console.log(`Conversation: ${summary.conversationId}`);
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const messages = [error.message];
  let cause = error.cause;
  while (cause instanceof Error) {
    messages.push(`Caused by: ${cause.message}`);
    cause = cause.cause;
  }
  return messages.join("\n");
}
