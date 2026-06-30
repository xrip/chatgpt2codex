import { shareUrlSchema } from "./types.js";

export function parseShareUrl(rawUrl: string): URL {
  const parsed = shareUrlSchema.safeParse(rawUrl);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid ChatGPT share URL");
  }

  return new URL(parsed.data);
}

export async function fetchShareHtml(rawUrl: string): Promise<string> {
  const url = parseShareUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (compatible; chatgpt2codex/0.1; +https://chatgpt.com/share)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ChatGPT share page: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`Expected HTML from ChatGPT share page, got ${contentType}`);
  }

  return response.text();
}
