import { describe, expect, it } from "vitest";

import { normalizeConversation } from "../src/normalizeConversation.js";

describe("normalizeConversation", () => {
  it("joins text parts and emits simple placeholders for omitted files", () => {
    const messages = normalizeConversation({
      mapping: {},
      linear_conversation: [
        {
          message: {
            author: { role: "user" },
            content: {
              parts: [
                "First",
                "Second",
                { file_name: "notes.txt" },
                { content_type: "image_asset_pointer" },
              ],
            },
          },
        },
      ],
    });

    expect(messages).toEqual([
      {
        role: "user",
        text: "First\n\nSecond\n\n[attachment omitted: notes.txt]\n\n[image omitted]",
        createdAt: undefined,
        id: undefined,
      },
    ]);
  });
});
