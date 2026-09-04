import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export type MentionUser = { id: string; name: string };

// A lightweight @-mention suggestion popup rendered as a plain DOM menu (no external
// popup lib), positioned at the caret and driven by the TipTap suggestion plugin.
function makeSuggestion(users: MentionUser[]): Omit<SuggestionOptions<MentionUser>, "editor"> {
  return {
    items: ({ query }) => {
      const q = query.toLowerCase();
      return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);
    },
    render: () => {
      let el: HTMLDivElement | null = null;
      let items: MentionUser[] = [];
      let selected = 0;
      let command: ((p: { id: string; label: string }) => void) | null = null;
      let getRect: (() => DOMRect | null) | null = null;

      const pick = (i: number) => { const u = items[i]; if (u && command) command({ id: u.id, label: u.name }); };

      const paint = () => {
        if (!el) return;
        el.innerHTML = "";
        if (!items.length) { el.style.display = "none"; return; }
        el.style.display = "block";
        items.forEach((u, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = u.name;
          b.className = "wiki-mention-item" + (i === selected ? " is-selected" : "");
          b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(i); });
          el!.appendChild(b);
        });
      };

      const place = () => {
        if (!el || !getRect) return;
        const r = getRect();
        if (!r) return;
        el.style.position = "fixed";
        el.style.zIndex = "80";
        el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 228)) + "px";
        el.style.top = r.bottom + 4 + "px";
      };

      return {
        onStart: (props: SuggestionProps<MentionUser>) => {
          items = props.items;
          selected = 0;
          command = props.command as (p: { id: string; label: string }) => void;
          getRect = props.clientRect ?? null;
          el = document.createElement("div");
          el.className = "wiki-mention-menu";
          document.body.appendChild(el);
          paint();
          place();
        },
        onUpdate: (props: SuggestionProps<MentionUser>) => {
          items = props.items;
          selected = 0;
          command = props.command as (p: { id: string; label: string }) => void;
          getRect = props.clientRect ?? null;
          paint();
          place();
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (!items.length) return false;
          const k = props.event.key;
          if (k === "ArrowDown") { selected = (selected + 1) % items.length; paint(); return true; }
          if (k === "ArrowUp") { selected = (selected - 1 + items.length) % items.length; paint(); return true; }
          if (k === "Enter") { pick(selected); return true; }
          if (k === "Escape") { el?.remove(); el = null; return true; }
          return false;
        },
        onExit: () => { el?.remove(); el = null; },
      };
    },
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
