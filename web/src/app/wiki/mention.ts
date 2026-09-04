import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { domListRenderer } from "./suggest-popup";

export type MentionUser = { id: string; name: string };

function makeSuggestion(users: MentionUser[]): Omit<SuggestionOptions<MentionUser>, "editor"> {
  return {
    items: ({ query }) => {
      const q = query.toLowerCase();
      return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);
    },
    render: domListRenderer<MentionUser>((u) => ({ id: u.id, label: u.name }), (u) => u.name),
  };
}

/** The Mention node. Pass a user list for an interactive composer; pass null for a
 * read-only renderer (parses stored @mention chips, no suggestion popup). */
export function buildMention(users: MentionUser[] | null) {
  return Mention.configure({
    HTMLAttributes: { class: "wiki-mention" },
    deleteTriggerWithBackspace: true,
    suggestion: users ? makeSuggestion(users) : { items: () => [] },
  });
}
