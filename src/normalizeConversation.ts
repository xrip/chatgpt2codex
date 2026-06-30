import {
  isRecord,
  maybeDateFromUnixSeconds,
  maybeString,
  type NormalizedMessage,
} from "./types.js";

export function normalizeConversation(conversationData: unknown): NormalizedMessage[] {
  if (!isRecord(conversationData)) {
    throw new Error("ChatGPT conversation data is not an object");
  }

  const linearConversation = conversationData.linear_conversation;
  if (!Array.isArray(linearConversation)) {
    throw new Error("ChatGPT conversation data does not include linear_conversation");
  }

  const messages: NormalizedMessage[] = [];

  for (const node of linearConversation) {
    const message = isRecord(node) ? node.message : undefined;
    if (!isRecord(message) || isHiddenMessage(message)) {
      continue;
    }

    const author = isRecord(message.author) ? message.author : undefined;
    const role = author?.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const text = extractMessageText(message.content);
    if (!text) {
      continue;
    }

    messages.push({
      role,
      text,
      createdAt: maybeDateFromUnixSeconds(message.create_time),
      id: maybeString(message.id),
    });
  }

  return messages;
}

function isHiddenMessage(message: Record<string, unknown>): boolean {
  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  if (!metadata) {
    return false;
  }

  return (
    metadata.is_visually_hidden_from_conversation === true ||
    metadata.is_hidden === true ||
    metadata.hidden === true
  );
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return normalizeText(content);
  }

  if (!isRecord(content)) {
    return "";
  }

  const pieces: string[] = [];
  if (Array.isArray(content.parts)) {
    for (const part of content.parts) {
      const text = extractPartText(part);
      if (text) {
        pieces.push(text);
      }
    }
  }

  if (pieces.length === 0 && typeof content.text === "string") {
    pieces.push(content.text);
  }

  return normalizeText(pieces.join("\n\n"));
}

function extractPartText(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (!isRecord(part)) {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  if (typeof part.name === "string") {
    return `[attachment omitted: ${part.name}]`;
  }

  if (typeof part.file_name === "string") {
    return `[attachment omitted: ${part.file_name}]`;
  }

  const contentType = maybeString(part.content_type);
  if (contentType?.includes("image")) {
    return "[image omitted]";
  }

  if (Array.isArray(part.parts)) {
    return part.parts
      .map((nestedPart) => extractPartText(nestedPart))
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
