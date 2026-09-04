import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { domListRenderer } from "./suggest-popup";

export type RefPage = { id: string; title: string };

/**
 * An inline reference to another wiki page. It stores only the target page's id, so it
 * survives the target being moved to a different folder (page URLs are id-based). The
 * link text is resolved to the page's CURRENT title at render time from `pages`, so
 * renames show up everywhere automatically; `label` is a fallback for pages not in the
 * list (no longer readable / deleted). Insert via the [[ trigger or the toolbar picker.
 */
export function buildPageRef(pages: RefPage[]) {
  const list = pages ?? [];
  const titleOf = new Map(list.map((p) => [p.id, p.title]));

  return Node.create({
    name: "pageRef",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        pageId: { default: null },
        label: { default: null },
      };
    },

    parseHTML() {
      return [
        {
          tag: "a[data-page-ref]",
          getAttrs: (el) => ({
            pageId: (el as HTMLElement).getAttribute("data-page-ref"),
            label: (el as HTMLElement).textContent?.replace(/^↗\s*/, "") || null,
          }),
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const pageId = (HTMLAttributes as { pageId?: string }).pageId || "";
      const label = (HTMLAttributes as { label?: string }).label || "Untitled";
      const title = titleOf.get(pageId) ?? label; // live title; falls back to stored label
      return [
        "a",
        mergeAttributes({ href: `/wiki/${pageId}`, "data-page-ref": pageId, class: "wiki-pageref" }),
        `↗ ${title}`,
      ];
    },

    renderText({ node }) {
      const pageId = node.attrs.pageId as string;
      return titleOf.get(pageId) ?? (node.attrs.label as string) ?? "Untitled";
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        Suggestion<RefPage>({
          editor,
          char: "[[",
          allowSpaces: true,
          startOfLine: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return list.filter((p) => (p.title || "Untitled").toLowerCase().includes(q)).slice(0, 8);
          },
          render: domListRenderer<RefPage>((p) => ({ id: p.id, label: p.title }), (p) => p.title || "Untitled"),
          command: ({ editor, range, props }) => {
            const { id, label } = props as unknown as { id: string; label: string };
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: "pageRef", attrs: { pageId: id, label } }, { type: "text", text: " " }])
              .run();
          },
        }),
      ];
    },
  });
}
