import { describe, expect, it } from "vitest";

import { decodeReactRouterTable } from "../src/decodeReactRouterStream.js";

describe("decodeReactRouterTable", () => {
  it("decodes reference-table object keys and values", () => {
    const decoded = decodeReactRouterTable([
      { _1: 2, _3: 4 },
      "hello",
      "world",
      "nested",
      { _5: 6 },
      "answer",
      42,
    ]);

    expect(decoded).toEqual({
      hello: "world",
      nested: {
        answer: 42,
      },
    });
  });

  it("maps negative sentinel references to undefined", () => {
    const decoded = decodeReactRouterTable([{ _1: -5 }, "missing"]);

    expect(decoded).toEqual({
      missing: undefined,
    });
  });
});
