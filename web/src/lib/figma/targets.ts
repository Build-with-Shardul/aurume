export type TargetProfile = {
  id: string;
  label: string;
  language: string;
  styling: string;
  guidance: string; // steers the model's output for this target
};

// Built-in targets. Adding a language is a profile entry, not a code generator.
export const TARGETS: TargetProfile[] = [
  { id: "react-tailwind", label: "React + Tailwind", language: "TypeScript React (.tsx)", styling: "Tailwind utility classes", guidance: "Function components, TypeScript. Express auto-layout as flexbox utilities (flex, flex-col, gap-*, p-*, items-*, justify-*). Map tokens to Tailwind classes; for unmapped raw values use an arbitrary value like bg-[#111019] and add a // TODO(token). Prefer semantic HTML. No inline styles unless a value can't be a utility." },
  { id: "html-tailwind", label: "HTML + Tailwind", language: "HTML", styling: "Tailwind utility classes", guidance: "A single semantic HTML fragment using Tailwind utilities. Auto-layout -> flex utilities. No framework, no <script>. Use arbitrary values for unmapped tokens and add an HTML comment TODO." },
  { id: "html-css", label: "HTML + plain CSS", language: "HTML + CSS", styling: "hand-written CSS (BEM-ish class names)", guidance: "Semantic HTML plus a scoped stylesheet. Auto-layout -> display:flex with gap/padding. Emit CSS custom properties for mapped tokens (var(--token)); for unmapped values use the literal and a /* TODO(token) */ comment. Class names derive from layer names." },
  { id: "vue-tailwind", label: "Vue 3 + Tailwind", language: "Vue SFC (<script setup lang=\"ts\">)", styling: "Tailwind utility classes", guidance: "A single-file component with <template> and <script setup lang=\"ts\">. Auto-layout -> flex utilities. Same token mapping rules as react-tailwind." },
  { id: "svelte", label: "Svelte + Tailwind", language: "Svelte component", styling: "Tailwind utility classes", guidance: "A .svelte component. Auto-layout -> flex utilities. Same token mapping rules as react-tailwind." },
  { id: "react-native", label: "React Native", language: "TypeScript React Native (.tsx)", styling: "StyleSheet.create", guidance: "Use View/Text/Image/Pressable, not DOM elements. Layout is flexbox by default (column). Convert Figma auto-layout to flexDirection/gap/padding/alignItems/justifyContent in a StyleSheet. Colors are literal hex or theme constants; there are no Tailwind classes. px values map 1:1 to RN units." },
  { id: "swiftui", label: "SwiftUI", language: "Swift (SwiftUI View)", styling: "SwiftUI modifiers", guidance: "A SwiftUI View struct. Row auto-layout -> HStack(spacing:), column -> VStack(spacing:); padding via .padding(EdgeInsets(...)). Fills -> .background(...), corner radius -> .cornerRadius(...). Colors as Color(hex:) or asset-catalog names for mapped tokens." },
  { id: "flutter", label: "Flutter", language: "Dart (Flutter widget)", styling: "widget properties / ThemeData", guidance: "A StatelessWidget. Row auto-layout -> Row, column -> Column with SizedBox/gap or spacing; padding via Padding/EdgeInsets. Fills -> Container(decoration: BoxDecoration(color, borderRadius, border, boxShadow)). Colors as Color(0xAARRGGBB) or theme tokens for mapped names." },
  { id: "angular", label: "Angular", language: "TypeScript (standalone Angular component)", styling: "Tailwind utility classes", guidance: "A standalone @Component with an inline template. Auto-layout -> flex utilities. Bind repeated content with @for where it helps; use semantic HTML. Same token mapping rules as react-tailwind (arbitrary values + TODO(token) when unmapped)." },
  { id: "qwik", label: "Qwik", language: "TypeScript Qwik (component$)", styling: "Tailwind utility classes", guidance: "A component$(() => ...) returning JSX. Use `class` (not className). Auto-layout -> flex utilities. Same token mapping rules as react-tailwind. Keep it serializable — no side effects at module scope." },
  { id: "solid", label: "SolidJS", language: "TypeScript SolidJS (.tsx)", styling: "Tailwind utility classes", guidance: "A Solid function component returning JSX. Use `class` (not className); map lists with <For>. Auto-layout -> flex utilities. Same token mapping rules as react-tailwind." },
  { id: "compose", label: "Jetpack Compose", language: "Kotlin (@Composable)", styling: "Compose modifiers", guidance: "A @Composable function. Row auto-layout -> Row(horizontalArrangement = Arrangement.spacedBy(gap.dp)), column -> Column(verticalArrangement = ...); cross-axis via verticalAlignment/horizontalAlignment. Padding via Modifier.padding(...). Fills -> Modifier.background(Color(0xAARRGGBB), RoundedCornerShape(radius.dp)); border via Modifier.border(...). Sizes in .dp, colors as Color(0xAARRGGBB) or MaterialTheme tokens for mapped names." },
];

export function allTargets(): TargetProfile[] {
  return TARGETS;
}
export function getTarget(id: string): TargetProfile | undefined {
  return TARGETS.find((t) => t.id === id);
}
