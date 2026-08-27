import type { FigmaNodesResponse, FigmaStyle } from "./client";
import type {
  Color,
  DesignIR,
  Fill,
  IRNode,
  Layout,
  NodeKind,
  Shadow,
  Sizing,
  Stroke,
  TextStyle,
} from "./types";

type Rgba = { r: number; g: number; b: number; a?: number };

function toHex(c: Rgba, opacity = 1): Color {
  const a = (c.a ?? 1) * opacity;
  const to = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
  return { hex: `#${to(c.r)}${to(c.g)}${to(c.b)}`, a: Math.round(a * 100) / 100 };
}

const KIND: Record<string, NodeKind> = {
  FRAME: "frame",
  GROUP: "group",
  SECTION: "frame",
  COMPONENT: "component",
  COMPONENT_SET: "component",
  INSTANCE: "instance",
  TEXT: "text",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  VECTOR: "vector",
  LINE: "vector",
  STAR: "vector",
  POLYGON: "vector",
  BOOLEAN_OPERATION: "vector",
};

const ALIGN: Record<string, string> = { MIN: "start", CENTER: "center", MAX: "end", BASELINE: "baseline", SPACE_BETWEEN: "space-between" };
const SIZING: Record<string, Sizing> = { FIXED: "fixed", HUG: "hug", FILL: "fill" };
const TRANSFORM: Record<string, string> = { UPPER: "uppercase", LOWER: "lowercase", TITLE: "capitalize" };

function styleName(styleMap: Record<string, FigmaStyle>, id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  return styleMap[id]?.name;
}

function normFills(node: any, styleMap: Record<string, FigmaStyle>, used: Set<string>): Fill[] {
  const token = styleName(styleMap, node.styles?.fill);
  const paints: any[] = Array.isArray(node.fills) ? node.fills : [];
  const out: Fill[] = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "SOLID") {
      const f: Fill = { type: "solid", color: toHex(p.color, p.opacity ?? 1), token };
      if (token) used.add(token);
      out.push(f);
    } else if (typeof p.type === "string" && p.type.startsWith("GRADIENT")) {
      out.push({ type: "gradient", raw: p.type, token });
    } else if (p.type === "IMAGE") {
      out.push({ type: "image", raw: p.imageRef });
    } else if (p.type) {
      out.push({ type: "other", raw: p.type });
    }
  }
  return out;
}

function normStrokes(node: any, styleMap: Record<string, FigmaStyle>, used: Set<string>): Stroke[] {
  const token = styleName(styleMap, node.styles?.stroke);
  const paints: any[] = Array.isArray(node.strokes) ? node.strokes : [];
  const weight: number = node.strokeWeight ?? 1;
  const align: string | undefined = node.strokeAlign;
  const out: Stroke[] = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "SOLID") {
      if (token) used.add(token);
      out.push({ color: toHex(p.color, p.opacity ?? 1), token, weight, align });
    }
  }
  return out;
}

function normShadows(node: any, styleMap: Record<string, FigmaStyle>, used: Set<string>): Shadow[] {
  const token = styleName(styleMap, node.styles?.effect);
  const effects: any[] = Array.isArray(node.effects) ? node.effects : [];
  const out: Shadow[] = [];
  for (const e of effects) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      if (token) used.add(token);
      out.push({
        x: e.offset?.x ?? 0,
        y: e.offset?.y ?? 0,
        blur: e.radius ?? 0,
        spread: e.spread ?? 0,
        color: toHex(e.color ?? { r: 0, g: 0, b: 0, a: 1 }),
        inset: e.type === "INNER_SHADOW",
        token,
      });
    }
  }
  return out;
}

function normLayout(node: any): Layout {
  const mode = node.layoutMode === "HORIZONTAL" ? "row" : node.layoutMode === "VERTICAL" ? "column" : "none";
  const box = node.absoluteBoundingBox;
  const layout: Layout = {
    mode,
    width: box?.width,
    height: box?.height,
  };
  if (mode !== "none") {
    layout.gap = node.itemSpacing ?? 0;
    layout.padding = {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    };
    layout.justify = ALIGN[node.primaryAxisAlignItems ?? "MIN"];
    layout.align = ALIGN[node.counterAxisAlignItems ?? "MIN"];
    if (node.layoutWrap === "WRAP") layout.wrap = true;
  }
  if (node.layoutGrow) layout.grow = true;
  if (node.layoutSizingHorizontal || node.layoutSizingVertical) {
    layout.sizing = {
      horizontal: SIZING[node.layoutSizingHorizontal] ?? undefined,
      vertical: SIZING[node.layoutSizingVertical] ?? undefined,
    };
  }
  return layout;
}

function normText(node: any, styleMap: Record<string, FigmaStyle>, used: Set<string>): TextStyle | undefined {
  if (node.type !== "TEXT") return undefined;
  const s = node.style ?? {};
  const token = styleName(styleMap, node.styles?.text);
  if (token) used.add(token);
  const fillToken = styleName(styleMap, node.styles?.fill);
  const solid = (Array.isArray(node.fills) ? node.fills : []).find((p: any) => p.type === "SOLID" && p.visible !== false);
  if (fillToken) used.add(fillToken);
  return {
    content: node.characters ?? "",
    token,
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    fontSize: s.fontSize,
    lineHeight: s.lineHeightPx != null ? Math.round(s.lineHeightPx) : s.lineHeightPercentFontSize ? `${s.lineHeightPercentFontSize}%` : undefined,
    letterSpacing: s.letterSpacing,
    color: solid ? toHex(solid.color, solid.opacity ?? 1) : undefined,
    colorToken: fillToken,
    align: s.textAlignHorizontal ? String(s.textAlignHorizontal).toLowerCase() : undefined,
    transform: s.textCase ? TRANSFORM[s.textCase] : undefined,
    decoration: s.textDecoration ? String(s.textDecoration).toLowerCase() : undefined,
  };
}

function cornerRadius(node: any): number | number[] | undefined {
  if (Array.isArray(node.rectangleCornerRadii)) {
    const [a, b, c, d] = node.rectangleCornerRadii;
    return a === b && b === c && c === d ? a : node.rectangleCornerRadii;
  }
  return typeof node.cornerRadius === "number" ? node.cornerRadius : undefined;
}

function normNode(node: any, styleMap: Record<string, FigmaStyle>, used: Set<string>, warnings: string[]): IRNode {
  const kind = KIND[node.type] ?? "frame";
  const ir: IRNode = {
    id: node.id,
    name: node.name ?? "",
    kind,
    figmaType: node.type,
    visible: node.visible !== false,
    layout: normLayout(node),
    fills: normFills(node, styleMap, used),
    strokes: normStrokes(node, styleMap, used),
    cornerRadius: cornerRadius(node),
    shadows: normShadows(node, styleMap, used),
    opacity: typeof node.opacity === "number" && node.opacity < 1 ? node.opacity : undefined,
    children: [],
  };

  const text = normText(node, styleMap, used);
  if (text) ir.text = text;

  if (node.type === "INSTANCE") {
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.componentProperties ?? {})) {
      const val = (v as any)?.value;
      if (val != null) props[k.replace(/#\d+:\d+$/, "")] = String(val);
    }
    ir.component = { name: node.name, componentId: node.componentId, properties: Object.keys(props).length ? props : undefined };
  }

  if ((Array.isArray(node.fills) ? node.fills : []).some((p: any) => p.type === "IMAGE" && p.visible !== false)) {
    ir.image = { ref: (node.fills as any[]).find((p) => p.type === "IMAGE")?.imageRef };
  }

  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    warnings.push(`Node "${node.name}" is a vector — export it as SVG/PNG rather than reconstructing it in code.`);
  }

  const children: any[] = Array.isArray(node.children) ? node.children : [];
  // Instances are treated as component references; don't recurse into their internals.
  if (node.type !== "INSTANCE") {
    ir.children = children.map((c) => normNode(c, styleMap, used, warnings));
  }
  return ir;
}

/** Convert a Figma /nodes response into the design IR for the requested node id. */
export function normalizeNodesResponse(
  resp: FigmaNodesResponse,
  opts: { fileKey: string; nodeId: string; url: string },
): DesignIR {
  const wrapper = resp.nodes[opts.nodeId];
  if (!wrapper?.document) {
    const available = Object.keys(resp.nodes).join(", ") || "none";
    throw new Error(`Node ${opts.nodeId} not found in the file. Nodes returned: ${available}.`);
  }
  const styleMap = wrapper.styles ?? {};
  const used = new Set<string>();
  const warnings: string[] = [];
  const root = normNode(wrapper.document, styleMap, used, warnings);
  return {
    source: { fileKey: opts.fileKey, nodeId: opts.nodeId, name: root.name, url: opts.url },
    root,
    tokens: { used: [...used].sort() },
    warnings,
  };
}
