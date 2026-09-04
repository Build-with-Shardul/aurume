import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

/**
 * A plain-DOM suggestion popup (no external popup lib) for the TipTap suggestion
 * plugin, positioned at the caret. `toText` labels a row; `toCommand` maps the picked
 * item to the args the suggestion's `command` expects. Reused by @mentions and [[page refs.
 */
export function domListRenderer<T>(toCommand: (t: T) => unknown, toText: (t: T) => string): SuggestionOptions<T>["render"] {
  return () => {
    let el: HTMLDivElement | null = null;
    let items: T[] = [];
    let selected = 0;
    let command: ((p: unknown) => void) | null = null;
    let getRect: (() => DOMRect | null) | null = null;

    const pick = (i: number) => { const it = items[i]; if (it !== undefined && command) command(toCommand(it)); };

    const paint = () => {
      if (!el) return;
      el.innerHTML = "";
      if (!items.length) { el.style.display = "none"; return; }
      el.style.display = "block";
      items.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = toText(it);
        b.className = "wiki-suggest-item" + (i === selected ? " is-selected" : "");
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
      el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 248)) + "px";
      el.style.top = r.bottom + 4 + "px";
    };

    return {
      onStart: (props: SuggestionProps<T>) => {
        items = props.items; selected = 0;
        command = props.command as (p: unknown) => void;
        getRect = props.clientRect ?? null;
        el = document.createElement("div");
        el.className = "wiki-suggest-menu";
        document.body.appendChild(el);
        paint(); place();
      },
      onUpdate: (props: SuggestionProps<T>) => {
        items = props.items; selected = 0;
        command = props.command as (p: unknown) => void;
        getRect = props.clientRect ?? null;
        paint(); place();
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
  };
}
