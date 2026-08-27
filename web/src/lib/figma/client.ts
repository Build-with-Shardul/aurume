export type FigmaClientOptions = { token?: string; baseUrl?: string };

/** Thin wrapper over the Figma REST API. Auth is a personal access token. */
export class FigmaClient {
  private token: string;
  private baseUrl: string;

  constructor(opts: FigmaClientOptions = {}) {
    const token = opts.token ?? process.env.FIGMA_TOKEN ?? process.env.FIGMA_ACCESS_TOKEN ?? "";
    if (!token) {
      throw new Error(
        "Missing Figma token. Set FIGMA_TOKEN to a Figma personal access token " +
          "(Figma → Settings → Security → Personal access tokens).",
      );
    }
    this.token = token;
    this.baseUrl = opts.baseUrl ?? "https://api.figma.com";
  }

  private async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-Figma-Token": this.token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Figma API ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    return (await res.json()) as T;
  }

  /** GET /v1/files/:key/nodes — the subtree(s) for the requested node ids. */
  getNodes(fileKey: string, ids: string[], opts: { depth?: number } = {}) {
    const q = new URLSearchParams({ ids: ids.join(",") });
    if (opts.depth) q.set("depth", String(opts.depth));
    return this.get<FigmaNodesResponse>(`/v1/files/${fileKey}/nodes?${q.toString()}`);
  }

  /** GET /v1/images/:key — rendered PNG/SVG URLs for node ids. */
  getImages(fileKey: string, ids: string[], opts: { format?: string; scale?: number } = {}) {
    const q = new URLSearchParams({
      ids: ids.join(","),
      format: opts.format ?? "png",
      scale: String(opts.scale ?? 2),
    });
    return this.get<{ images: Record<string, string | null>; err?: string }>(
      `/v1/images/${fileKey}?${q.toString()}`,
    );
  }
}

// Minimal typing for the parts of the /nodes response we consume.
export type FigmaStyle = { key: string; name: string; styleType: string };
export type FigmaNodeWrapper = {
  document: Record<string, unknown>;
  styles?: Record<string, FigmaStyle>;
};
export type FigmaNodesResponse = {
  name?: string;
  nodes: Record<string, FigmaNodeWrapper | undefined>;
};
