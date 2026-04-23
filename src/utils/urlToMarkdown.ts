import TurndownService from "turndown";

/**
 * Fetch a URL and return its content as AI‑ready Markdown (no HTML tags).
 *
 * @param url - The website URL to fetch.
 * @returns A Promise resolving to the Markdown string.
 * @throws Error if the fetch fails or the page is invalid.
 */
export async function urlToMarkdown(url: string): Promise<string> {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    strongDelimiter: "**",
    emDelimiter: "*",
  });

  // Drop non‑content stuff
  turndown.remove([
    "script",
    "style",
    "noscript",
    "iframe",
    "img",
    "svg",
    "meta",
    "link",
    "aside",
    "nav",
    "footer",
    ".ads",
    ".ad",
    ".footer-menu",
    ".sidebar",
  ]);

  // Improve link handling
  turndown.addRule("links", {
    filter: ["a"],
    replacement(content: string, node: HTMLElement): string {
      const href = node.getAttribute("href");
      if (!href) return content;
      return `[${content}](${href})`;
    },
  });

  // Fetch HTML
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const html = await res.text();

  // Parse HTML to DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Prefer main/content; fall back to body
  const body =
    doc.querySelector("main") ||
    doc.querySelector(".content") ||
    doc.body;

  // Convert to Markdown
  return turndown.turndown(body.innerHTML);
}
