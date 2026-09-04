import { Node, mergeAttributes } from "@tiptap/core";

export type EmbedDiagram = { id: string; title: string; preview: string | null };

/**
 * An inline-block embed of a draw.io diagram inside a wiki page. Stores only the
 * diagram's id; the preview SVG and title are resolved live from `diagrams` at render
 * time, so editing the diagram updates every page that embeds it. Clicking opens the
 * diagram editor. The preview is a data-URI SVG rendered via <img> (no script execution).
 */
export function buildDiagramEmbed(diagrams: EmbedDiagram[]) {
  const map = new Map((diagrams ?? []).map((d) => [d.id, d]));

  return Node.create({
    name: "diagramEmbed",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return { diagramId: { default: null }, title: { default: null } };
    },

    parseHTML() {
      return [
        {
          tag: "div[data-diagram-embed]",
          getAttrs: (el) => ({
            diagramId: (el as HTMLElement).getAttribute("data-diagram-embed"),
            title: (el as HTMLElement).getAttribute("data-title"),
          }),
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const id = (HTMLAttributes as { diagramId?: string }).diagramId || "";
      const d = map.get(id);
      const title = d?.title ?? (HTMLAttributes as { title?: string }).title ?? "Diagram";
      const attrs = mergeAttributes({ "data-diagram-embed": id, "data-title": title, class: "wiki-diagram" });
      if (d?.preview) {
        return [
          "div",
          attrs,
          ["img", { src: d.preview, alt: title, class: "wiki-diagram-img" }],
          ["div", { class: "wiki-diagram-cap" }, `📐 ${title}`],
        ];
      }
      return ["div", attrs, ["div", { class: "wiki-diagram-empty" }, `📐 ${title} — open to edit`]];
    },
  });
}
