const ENQUEUE_MARKER = "window.__reactRouterContext.streamController.enqueue(";

export function extractReactRouterStreamPayloads(html: string): string[] {
  const payloads: string[] = [];
  let offset = 0;

  while (offset < html.length) {
    const markerIndex = html.indexOf(ENQUEUE_MARKER, offset);
    if (markerIndex === -1) {
      break;
    }

    let cursor = markerIndex + ENQUEUE_MARKER.length;
    while (/\s/.test(html[cursor] ?? "")) {
      cursor += 1;
    }

    const parsed = parseDoubleQuotedStringLiteral(html, cursor);
    payloads.push(parsed.value);
    offset = parsed.endIndex;
  }

  return payloads;
}

export function decodeReactRouterStreamPayload(payload: string): unknown {
  const table = JSON.parse(payload) as unknown;
  return decodeReactRouterTable(table);
}

export function decodeReactRouterTable(table: unknown): unknown {
  if (!Array.isArray(table)) {
    throw new Error("React Router stream payload is not a reference table");
  }

  const memo = new Map<number, unknown>();

  const decodeIndex = (index: number): unknown => {
    if (!Number.isInteger(index) || index < 0 || index >= table.length) {
      throw new Error(`Invalid reference-table index: ${index}`);
    }

    if (memo.has(index)) {
      return memo.get(index);
    }

    const value = table[index];

    if (Array.isArray(value)) {
      const decoded: unknown[] = [];
      memo.set(index, decoded);
      for (const item of value) {
        decoded.push(decodeRef(item));
      }
      return decoded;
    }

    if (isPlainObject(value)) {
      const decoded: Record<string, unknown> = {};
      memo.set(index, decoded);

      for (const [encodedKey, encodedValue] of Object.entries(value)) {
        const key = decodeObjectKey(encodedKey);
        if (key === undefined) {
          continue;
        }

        decoded[key] = decodeRef(encodedValue);
      }

      return decoded;
    }

    return value;
  };

  const decodeRef = (value: unknown): unknown => {
    if (typeof value === "number" && Number.isInteger(value)) {
      if (value < 0) {
        return undefined;
      }

      if (value < table.length) {
        return decodeIndex(value);
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => decodeRef(item));
    }

    if (isPlainObject(value)) {
      const decoded: Record<string, unknown> = {};
      for (const [encodedKey, encodedValue] of Object.entries(value)) {
        const key = decodeObjectKey(encodedKey);
        if (key !== undefined) {
          decoded[key] = decodeRef(encodedValue);
        }
      }
      return decoded;
    }

    return value;
  };

  const decodeObjectKey = (key: string): string | undefined => {
    const match = /^_(\d+)$/.exec(key);
    if (!match) {
      return key;
    }

    const decoded = decodeIndex(Number(match[1]));
    return typeof decoded === "string" ? decoded : undefined;
  };

  return decodeIndex(0);
}

function parseDoubleQuotedStringLiteral(
  source: string,
  startIndex: number,
): { value: string; endIndex: number } {
  if (source[startIndex] !== '"') {
    throw new Error("Expected a double-quoted React Router stream payload");
  }

  let escaped = false;
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      const literal = source.slice(startIndex, index + 1);
      return {
        value: JSON.parse(literal) as string,
        endIndex: index + 1,
      };
    }
  }

  throw new Error("Unterminated React Router stream payload string");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
