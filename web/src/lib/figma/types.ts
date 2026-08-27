// Framework-agnostic design intermediate representation (IR).
// The server normalizes raw Figma node JSON into this shape; every target
// language/framework is generated from the IR, so the extraction logic is
// written once and shared across all outputs.

export type Color = { hex: string; a: number };

export type Fill = {
  type: "solid" | "gradient" | "image" | "other";
  color?: Color;
  token?: string; // resolved Figma style/variable name, e.g. "neutral/200"
  raw?: string; // gradient type / imageRef / unsupported paint type
};

export type Stroke = {
  color?: Color;
  token?: string;
  weight: number;
  align?: string;
};

export type Shadow = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: Color;
  inset: boolean;
  token?: string;
};

export type Sizing = "fixed" | "hug" | "fill";

export type Layout = {
  mode: "row" | "column" | "none"; // auto-layout direction, or none (absolute)
  gap?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  align?: string; // cross-axis: start | center | end | baseline
  justify?: string; // main-axis: start | center | end | space-between
  wrap?: boolean;
  width?: number;
  height?: number;
  grow?: boolean;
  sizing?: { horizontal?: Sizing; vertical?: Sizing };
};

export type TextStyle = {
  content: string;
  token?: string; // text style name, e.g. "heading/h3"
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  color?: Color;
  colorToken?: string;
  align?: string;
  transform?: string; // uppercase | lowercase | capitalize
  decoration?: string;
};

export type NodeKind =
  | "frame"
  | "text"
  | "image"
  | "vector"
  | "rectangle"
  | "ellipse"
  | "instance"
  | "component"
  | "group";

export type IRNode = {
  id: string;
  name: string;
  kind: NodeKind;
  figmaType: string;
  visible: boolean;
  layout: Layout;
  fills: Fill[];
  strokes: Stroke[];
  cornerRadius?: number | number[];
  shadows: Shadow[];
  opacity?: number;
  text?: TextStyle;
  component?: { name: string; componentId?: string; properties?: Record<string, string> };
  image?: { ref?: string };
  children: IRNode[];
};

export type DesignIR = {
  source: { fileKey: string; nodeId: string; name: string; url: string };
  root: IRNode;
  tokens: { used: string[] }; // distinct Figma style/variable names referenced in this tree
  warnings: string[];
};
