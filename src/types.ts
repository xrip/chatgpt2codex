import { z } from "zod";

export type ConversationRole = "user" | "assistant";

export interface NormalizedMessage {
  role: ConversationRole;
  text: string;
  createdAt?: Date;
  id?: string;
}

export interface ParsedChatGptShare {
  title: string;
  conversationId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  modelSlug?: string;
  modelTitle?: string;
  messages: NormalizedMessage[];
}

export interface ExistingCodexSession {
  id?: string;
  cwd: string;
  filePath: string;
  timestamp?: string;
  source?: "jsonl" | "state_db";
  archived?: boolean;
}

export interface WriteCodexRolloutOptions {
  codexHome: string;
  cwd: string;
  title: string;
  messages: NormalizedMessage[];
  toolVersion: string;
  conversationId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  modelSlug?: string;
  threadId?: string;
  now?: Date;
  writeStateDb?: boolean;
}

export interface WriteCodexRolloutResult {
  threadId: string;
  filePath: string;
  sessionIndexPath: string;
  lineCount: number;
  stateDbWritten?: boolean;
}

export const shareUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      (host === "chatgpt.com" ||
        host === "www.chatgpt.com" ||
        host === "chat.openai.com") &&
      /^\/share\/[^/]+\/?$/.test(url.pathname)
    );
  }, "Expected a ChatGPT share URL like https://chatgpt.com/share/<id>");

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function maybeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function maybeDateFromUnixSeconds(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed * 1000);
    }
  }

  return undefined;
}
