export function makeSyntheticShareHtml(): string {
  const root = {
    loaderData: {
      "routes/share.$shareId.($action)": {
        serverResponse: {
          data: {
            title: "Synthetic Chat",
            conversation_id: "conv-test",
            create_time: 1_710_000_000,
            update_time: 1_710_000_060,
            default_model_slug: "gpt-test",
            model: {
              title: "GPT Test",
            },
            mapping: {},
            linear_conversation: [
              {
                message: {
                  id: "system-1",
                  author: {
                    role: "system",
                  },
                  content: {
                    parts: ["System text"],
                  },
                },
              },
              {
                message: {
                  id: "user-1",
                  author: {
                    role: "user",
                  },
                  create_time: 1_710_000_001,
                  content: {
                    content_type: "text",
                    parts: ["Hello Codex"],
                  },
                },
              },
              {
                message: {
                  id: "assistant-1",
                  author: {
                    role: "assistant",
                  },
                  create_time: 1_710_000_002,
                  content: {
                    content_type: "text",
                    parts: ["Hello from ChatGPT"],
                  },
                },
              },
              {
                message: {
                  id: "hidden-1",
                  author: {
                    role: "assistant",
                  },
                  metadata: {
                    is_visually_hidden_from_conversation: true,
                  },
                  content: {
                    parts: ["Hidden text"],
                  },
                },
              },
            ],
          },
        },
      },
    },
  };

  const table = encodeReferenceTable(root);
  const payload = JSON.stringify(table);
  return `<html><script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(
    payload,
  )});</script></html>`;
}

function encodeReferenceTable(value: unknown): unknown[] {
  const table: unknown[] = [];

  const encode = (item: unknown): number => {
    const index = table.length;
    table.push(null);

    if (Array.isArray(item)) {
      table[index] = item.map((nested) => encode(nested));
      return index;
    }

    if (typeof item === "object" && item !== null) {
      const encoded: Record<string, number> = {};
      for (const [key, nested] of Object.entries(item)) {
        encoded[`_${encode(key)}`] = encode(nested);
      }
      table[index] = encoded;
      return index;
    }

    table[index] = item;
    return index;
  };

  encode(value);
  return table;
}
