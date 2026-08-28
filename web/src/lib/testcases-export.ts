import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import PDFDocument from "pdfkit";

export type ExportCase = {
  title: string;
  priority: string;
  suites: string[];
  preconditions: string | null;
  steps: string[];
  expectedResult: string | null;
  storyTitle?: string;
};
export type TestCasesDocData = {
  projectName: string;
  version: number;
  status: string;
  provider: string | null;
  model: string | null;
  groundedness: number | null;
  tokens: number | null;
  generatedAt: Date;
  coverage: { covered: number; total: number };
  approvers: Array<{ name: string; approvedAt: Date | null }>;
  categories: Array<{ label: string; cases: ExportCase[] }>;
};

const fully = (d: TestCasesDocData) => d.approvers.length > 0 && d.approvers.every((a) => a.approvedAt);
const approvalLine = (d: TestCasesDocData) => (fully(d) || d.status === "approved" ? "Approved" : d.approvers.length ? "Draft — pending approval" : "Draft — no approvers assigned");
const caseCell = (c: ExportCase) => [c.title, c.priority, c.suites.join(", ") || "—", [c.preconditions ? `Pre: ${c.preconditions}` : "", ...c.steps].filter(Boolean).join("\n"), c.expectedResult || "—"];

export async function buildTestCasesDocx(d: TestCasesDocData): Promise<Buffer> {
  const H = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
  const meta = (label: string, val: string) => new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(val)], spacing: { after: 20 } });
  const HEADER_FILL = "1F2937";
  const headers = ["Test case", "Priority", "Suites", "Steps (Gherkin)", "Expected"];
  function table(rows: string[][]) {
    const border = { style: "single" as const, size: 4, color: "BFBFBF" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerRow = new TableRow({ tableHeader: true, children: headers.map((h) => new TableCell({ borders, shading: { fill: HEADER_FILL }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 16 })] })] })) });
    const body = rows.length ? rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: c || "—", size: 18 })] })] })) })) : [new TableRow({ children: headers.map(() => new TableCell({ borders, children: [new Paragraph("—")] })) })];
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...body] });
  }
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: `Test Cases — ${d.projectName}`, bold: true, size: 32 })], spacing: { after: 80 } }),
    meta("Version", `v${d.version}`),
    meta("Approval status", approvalLine(d)),
    meta("Coverage", `${d.coverage.covered}/${d.coverage.total} stories`),
    meta("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`),
    ...(d.groundedness != null ? [meta("Groundedness", `${d.groundedness}%`)] : []),
    ...(d.tokens != null ? [meta("Tokens used", d.tokens.toLocaleString())] : []),
  ];
  for (const cat of d.categories) {
    if (!cat.cases.length) continue;
    children.push(H(cat.label));
    children.push(table(cat.cases.map(caseCell)));
  }
  const doc = new Document({ styles: { default: { document: { run: { font: "Calibri", size: 20 } } } }, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export function buildTestCasesPdf(d: TestCasesDocData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (ch: Buffer) => chunks.push(ch));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 100;
    const h2 = (t: string) => { doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#111").text(t); doc.moveDown(0.2); };
    const kv = (k: string, v: string) => { doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(`${k}: `, { continued: true }).font("Helvetica").fillColor("#333").text(v); };
    const headers = ["Test case", "Pri", "Suites", "Steps (Gherkin)", "Expected"];
    const fractions = [0.24, 0.08, 0.14, 0.34, 0.2];

    const drawTable = (rows: string[][]) => {
      const startX = doc.page.margins.left;
      const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colW = fractions.map((f) => f * totalW);
      const pad = 5, fs = 8.5, headerFill = "#1F2937", lineColor = "#C7CDD4";
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const rowH = (cells: string[], bold: boolean) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs); let mx = 12; cells.forEach((c, i) => { const h = doc.heightOfString(c || "—", { width: colW[i] - 2 * pad }); if (h > mx) mx = h; }); return mx + 2 * pad; };
      const drawRow = (cells: string[], y: number, h: number, fill: string | null, textColor: string, bold: boolean) => { let x = startX; cells.forEach((c, i) => { if (fill) doc.save().rect(x, y, colW[i], h).fill(fill).restore(); doc.lineWidth(0.5).strokeColor(lineColor).rect(x, y, colW[i], h).stroke(); doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs).fillColor(textColor).text(c || "—", x + pad, y + pad, { width: colW[i] - 2 * pad }); x += colW[i]; }); };
      const header = () => { const h = rowH(headers, true); const y = doc.y; drawRow(headers, y, h, headerFill, "#FFFFFF", true); doc.y = y + h; };
      if (doc.y + 44 > bottom()) doc.addPage();
      header();
      (rows.length ? rows : [headers.map(() => "—")]).forEach((r) => { const h = rowH(r, false); if (doc.y + h > bottom()) { doc.addPage(); header(); } const y = doc.y; drawRow(r, y, h, null, "#333333", false); doc.y = y + h; });
      doc.x = startX; doc.moveDown(0.6);
    };

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(`Test Cases — ${d.projectName}`, { width: W });
    doc.moveDown(0.4);
    kv("Version", `v${d.version}`);
    kv("Approval status", approvalLine(d));
    kv("Coverage", `${d.coverage.covered}/${d.coverage.total} stories`);
    kv("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`);
    if (d.groundedness != null) kv("Groundedness", `${d.groundedness}%`);
    if (d.tokens != null) kv("Tokens used", d.tokens.toLocaleString());

    for (const cat of d.categories) {
      if (!cat.cases.length) continue;
      h2(cat.label);
      drawTable(cat.cases.map((c) => [c.title, c.priority, c.suites.join(", "), [c.preconditions ? `Pre: ${c.preconditions}` : "", ...c.steps].filter(Boolean).join("\n"), c.expectedResult || "—"]));
    }
    doc.end();
  });
}
