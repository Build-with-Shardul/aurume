import type { TargetProfile } from "./targets";
import type { DesignIR, IRNode } from "./types";
import { AURUME_CONFIG, resolveComponent, resolveToken, type ProjectFigmaConfig } from "./standards";

function collectComponents(node: IRNode, out: Set<string>) {
  if (node.component?.name) out.add(node.component.name);
  for (const c of node.children) collectComponents(c, out);
}

/**
 * Build the codegen brief: a self-contained instruction the model reads to write
 * code for the chosen target. The deterministic work (Figma extraction, token /
 * component resolution) is done here; the model does the synthesis.
 */
export function buildCodegenBrief(ir: DesignIR, target: TargetProfile, cfg: ProjectFigmaConfig | null = AURUME_CONFIG): string {
  const lines: string[] = [];
  lines.push(`# Figma → code: "${ir.source.name}"`);
  lines.push("");
  lines.push(`**Target:** ${target.label} — ${target.language}, styled with ${target.styling}.`);
  lines.push("");

  if (cfg?.standards) {
    lines.push("## House standards (follow these)");
    lines.push(cfg.standards);
    lines.push("");
  }

  lines.push("## How to generate");
  lines.push(target.guidance);
  lines.push(
    "Reproduce the layout structure and text exactly. Use the token and component mappings below wherever they apply; " +
      "for anything unmapped, use the literal value and leave a clear TODO(token) so it can be tokenized later. " +
      "Only emit the component/markup — no invented copy, no placeholder lorem, no extra wrappers.",
  );
  lines.push("");

  const usedTokens = ir.tokens.used;
  lines.push("## Token map (Figma style → this target)");
  if (usedTokens.length === 0) {
    lines.push("_No Figma styles/variables referenced — values below are raw._");
  } else {
    lines.push("| Figma token | Use in code |");
    lines.push("| --- | --- |");
    for (const t of usedTokens) {
      const mapped = resolveToken(cfg, t, target.id);
      lines.push(`| \`${t}\` | ${mapped ? `\`${mapped}\`` : "_unmapped → raw value + TODO(token)_"} |`);
    }
  }
  lines.push("");

  const comps = new Set<string>();
  collectComponents(ir.root, comps);
  if (comps.size) {
    lines.push("## Component instances");
    lines.push("| Figma component | Use in code |");
    lines.push("| --- | --- |");
    for (const name of [...comps].sort()) {
      const snippet = resolveComponent(cfg, name, target.id);
      lines.push(`| \`${name}\` | ${snippet ? `\`${snippet}\`` : "_unmapped → build inline from the IR_"} |`);
    }
    lines.push("");
  }

  if (ir.warnings.length) {
    lines.push("## Warnings");
    for (const w of ir.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("## Design IR");
  lines.push("The normalized tree to implement (sizes in px, colors resolved, auto-layout as row/column):");
  lines.push("```json");
  lines.push(JSON.stringify(ir.root, null, 2));
  lines.push("```");
  return lines.join("\n");
}
