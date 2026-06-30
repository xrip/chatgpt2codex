import {
  decodeReactRouterStreamPayload,
  extractReactRouterStreamPayloads,
} from "./decodeReactRouterStream.js";
import { normalizeConversation } from "./normalizeConversation.js";
import {
  isRecord,
  maybeDateFromUnixSeconds,
  maybeString,
  type ParsedChatGptShare,
} from "./types.js";

export function parseChatGptShareHtml(html: string): ParsedChatGptShare {
  const payloads = extractReactRouterStreamPayloads(html);
  if (payloads.length === 0) {
    throw new Error("Could not find ChatGPT share stream payload in HTML");
  }

  const errors: Error[] = [];

  for (const payload of payloads) {
    try {
      const decoded = decodeReactRouterStreamPayload(payload);
      const conversationData = findConversationData(decoded);
      if (!conversationData) {
        continue;
      }

      const messages = normalizeConversation(conversationData);
      if (messages.length === 0) {
        throw new Error("ChatGPT share contains no visible user/assistant messages");
      }

      const model = isRecord(conversationData.model)
        ? conversationData.model
        : undefined;

      return {
        title: maybeString(conversationData.title) ?? "Imported ChatGPT chat",
        conversationId: maybeString(conversationData.conversation_id),
        createdAt: maybeDateFromUnixSeconds(conversationData.create_time),
        updatedAt: maybeDateFromUnixSeconds(conversationData.update_time),
        modelSlug: maybeString(conversationData.default_model_slug),
        modelTitle: maybeString(model?.title),
        messages,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  const detail = errors.at(-1)?.message;
  throw new Error(
    detail
      ? `Could not parse ChatGPT share payload: ${detail}`
      : "Could not locate ChatGPT conversation data in stream payload",
  );
}

function findConversationData(root: unknown): Record<string, unknown> | undefined {
  const direct = findConversationDataFromLoader(root);
  if (direct) {
    return direct;
  }

  const seen = new Set<unknown>();
  const queue: unknown[] = [root];
  let visited = 0;

  while (queue.length > 0 && visited < 100_000) {
    const value = queue.shift();
    visited += 1;

    if (!isRecord(value) && !Array.isArray(value)) {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }
    seen.add(value);

    if (isConversationData(value)) {
      return value;
    }

    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      if (isRecord(child) || Array.isArray(child)) {
        queue.push(child);
      }
    }
  }

  return undefined;
}

function findConversationDataFromLoader(
  root: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(root) || !isRecord(root.loaderData)) {
    return undefined;
  }

  for (const routeData of Object.values(root.loaderData)) {
    if (!isRecord(routeData)) {
      continue;
    }

    const serverResponse = routeData.serverResponse;
    const data = isRecord(serverResponse) ? serverResponse.data : undefined;
    if (isConversationData(data)) {
      return data;
    }
  }

  return undefined;
}

function isConversationData(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Array.isArray(value.linear_conversation) &&
    (isRecord(value.mapping) || typeof value.conversation_id === "string")
  );
}
