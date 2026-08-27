// House standards + token/component maps used to steer generation toward Aurume's
// own conventions. This is the "follow your standards" layer, kept in-repo so it
// travels with the code. Extend the maps as the design system grows.
export type ProjectFigmaConfig = {
  standards?: string;
  tokens?: Record<string, Partial<Record<string, string>>>; // figmaName -> { targetId: token }
  components?: Record<string, Partial<Record<string, string>>>; // figmaName -> { targetId: snippet }
};

export const AURUME_CONFIG: ProjectFigmaConfig = {
  standards:
    "Aurume web: Next.js server components by default, TypeScript, Tailwind. Cards are `rounded-xl border border-neutral-200 bg-white p-5`. Neutral palette; avoid arbitrary hex where a token exists. Meet WCAG 2.2 AA: real focus states, labelled controls, 4.5:1 text contrast, 24px+ targets. Match the surrounding file's naming and idioms; prefer the shared `<Card>`/`<Field>` primitives where they fit.",
  tokens: {
    "surface/white": { "react-tailwind": "bg-white", "html-css": "var(--surface)" },
    "neutral/200": { "react-tailwind": "border-neutral-200", "html-css": "var(--line)" },
    "neutral/900": { "react-tailwind": "text-neutral-900", "html-css": "var(--ink)" },
    "heading/h3": { "react-tailwind": "text-base font-semibold", "*": "h3" },
  },
  components: {
    "Button/Primary": { "react-tailwind": "<button className=\"rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white\">…</button>" },
  },
};

export function resolveToken(cfg: ProjectFigmaConfig | null, figmaName: string, targetId: string): string | undefined {
  return cfg?.tokens?.[figmaName]?.[targetId] ?? cfg?.tokens?.[figmaName]?.["*"];
}
export function resolveComponent(cfg: ProjectFigmaConfig | null, name: string, targetId: string): string | undefined {
  return cfg?.components?.[name]?.[targetId] ?? cfg?.components?.[name]?.["*"];
}
