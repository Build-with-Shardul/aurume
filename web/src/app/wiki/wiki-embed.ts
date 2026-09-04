import { Node, mergeAttributes } from "@tiptap/core";

// A minimal embed node: renders a responsive iframe from a src (YouTube/Loom embed URL).
export const WikiEmbed = Node.create({
  name: "wikiEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-wiki-embed]",
        getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("data-src") }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = (HTMLAttributes as { src?: string }).src || "";
    return [
      "div",
      { "data-wiki-embed": "", "data-src": src, class: "wiki-embed" },
      ["iframe", mergeAttributes({ src, frameborder: "0", loading: "lazy", allowfullscreen: "true", allow: "fullscreen; picture-in-picture" })],
    ];
  },
});

/** Convert a YouTube/Loom share URL into its embeddable iframe URL. Returns null if unsupported. */
export function toEmbedUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube.com${u.pathname}`;
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (host === "youtu.be") {
      const idPart = u.pathname.slice(1);
      if (idPart) return `https://www.youtube.com/embed/${idPart}`;
    }
    if (host === "loom.com") {
      const match = u.pathname.match(/\/(share|embed)\/([A-Za-z0-9]+)/);
      if (match) return `https://www.loom.com/embed/${match[2]}`;
    }
    return null;
  } catch {
    return null;
  }
}
