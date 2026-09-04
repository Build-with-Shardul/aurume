import { Mark, mergeAttributes } from "@tiptap/core";

// An inline mark that anchors a comment thread to a text range. Because it's a
// ProseMirror mark stored in the document body, the anchor is remapped through
// edits automatically. `commentId` = the root document_comment id for the thread.
export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return { commentId: { default: null } };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]", getAttrs: (el) => ({ commentId: (el as HTMLElement).getAttribute("data-comment-id") }) }];
  },

  renderHTML({ HTMLAttributes }) {
    const commentId = (HTMLAttributes as { commentId?: string }).commentId || "";
    return ["span", mergeAttributes({ "data-comment-id": commentId, class: "wiki-comment" }), 0];
  },
});
