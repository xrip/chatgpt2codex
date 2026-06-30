import { describe, expect, it } from "vitest";

import { parseChatGptShareHtml } from "../src/parseChatGptShare.js";
import { makeSyntheticShareHtml } from "./syntheticShare.js";

describe("parseChatGptShareHtml", () => {
  it("extracts visible user and assistant messages from a share payload", () => {
    const parsed = parseChatGptShareHtml(makeSyntheticShareHtml());

    expect(parsed.title).toBe("Synthetic Chat");
    expect(parsed.conversationId).toBe("conv-test");
    expect(parsed.modelSlug).toBe("gpt-test");
    expect(parsed.modelTitle).toBe("GPT Test");
    expect(parsed.createdAt?.toISOString()).toBe("2024-03-09T16:00:00.000Z");
    expect(parsed.messages).toEqual([
      {
        role: "user",
        text: "Hello Codex",
        createdAt: new Date("2024-03-09T16:00:01.000Z"),
        id: "user-1",
      },
      {
        role: "assistant",
        text: "Hello from ChatGPT",
        createdAt: new Date("2024-03-09T16:00:02.000Z"),
        id: "assistant-1",
      },
    ]);
  });
});
