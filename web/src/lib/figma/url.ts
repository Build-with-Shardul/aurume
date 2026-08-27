export type FigmaTarget = { fileKey: string; nodeId: string | null };

/**
 * Parse a Figma file/design/proto/board URL into a file key + node id.
 * Accepts links copied from the Figma app; the URL node-id uses a hyphen
 * (`12-345`) while the REST API expects a colon (`12:345`), so we convert.
 */
export function parseFigmaUrl(input: string): FigmaTarget {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`Not a valid URL: ${input}`);
  }
  if (!/(^|\.)figma\.com$/.test(url.hostname)) {
    throw new Error(`Not a figma.com URL (got ${url.hostname}).`);
  }
  const m = url.pathname.match(/\/(file|design|proto|board)\/([A-Za-z0-9]+)/);
  if (!m) {
    throw new Error("URL is missing a Figma file key — expected /file|/design|/proto/<key>.");
  }
  const fileKey = m[2];
  let nodeId = url.searchParams.get("node-id");
  if (nodeId) nodeId = nodeId.replace(/-/g, ":");
  return { fileKey, nodeId: nodeId || null };
}
