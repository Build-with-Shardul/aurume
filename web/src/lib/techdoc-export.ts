import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";
import type { TechDocContent } from "./ai/techdoc";

export type TechDocDocData = {
  projectName: string;
  version: number;
  status: string; // draft | approved
  provider: string | null;
  model: string | null;
  groundedness: number | null;
  tokens: number | null;
  generatedAt: Date;
  sourcePlaybookVersion: string | null;
  content: TechDocContent;
  approvers: Array<{ name: string; approvedAt: Date | null }>;
};

const fully = (d: TechDocDocData) => d.approvers.length > 0 && d.approvers.every((a) => a.approvedAt);
const approvalLine = (d: TechDocDocData) =>
  fully(d) || d.status === "approved" ? "Approved" : d.approvers.length ? "Draft — pending approval" : "Draft — no approvers assigned";

// ---------------------------------------------------------------- DOCX ----

export async function buildTechDocDocx(d: TechDocDocData): Promise<Buffer> {
  const c = d.content;
  const H = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
  const P = (text: string) => new Paragraph({ children: [new TextRun(text || "—")], spacing: { after: 80 } });
  const bullets = (items: string[]) =>
    items.length ? items.map((t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 20 } })) : [P("—")];
  const meta = (label: string, val: string) => new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(val)], spacing: { after: 20 } });

  const HEADER_FILL = "1F2937";
  function table(headers: string[], rows: string[][]) {
    const border = { style: "single" as const, size: 4, color: "BFBFBF" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map((h) => new TableCell({ borders, shading: { fill: HEADER_FILL }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })] })),
    });
    const bodyRows = rows.length
      ? rows.map((r) => new TableRow({ children: r.map((c2) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: c2 || "—", size: 20 })] })] })) }))
      : [new TableRow({ children: headers.map(() => new TableCell({ borders, children: [P("—")] })) })];
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
  }

  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: `Technical Design Document — ${d.projectName}`, bold: true, size: 32 })], spacing: { after: 80 } }),
    meta("Version", `v${d.version}${d.sourcePlaybookVersion ? ` · from playbook ${d.sourcePlaybookVersion}` : ""}`),
    meta("Approval status", approvalLine(d)),
    meta("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`),
    ...(d.groundedness != null ? [meta("Groundedness", `${d.groundedness}%`)] : []),
    ...(d.tokens != null ? [meta("Tokens used", d.tokens.toLocaleString())] : []),

    H("Approvals"),
    table(["Approver", "Status"], d.approvers.length ? d.approvers.map((a) => [a.name, a.approvedAt ? `Approved ${a.approvedAt.toLocaleString()}` : "Pending"]) : []),

    H("Overview"),
    P(c.overview),
    H("Goals"),
    ...bullets(c.goals),
    H("Non-goals"),
    ...bullets(c.nonGoals),
    H("Architecture"),
    P(c.architectureOverview),

    H("Components"),
    table(["Component", "Responsibility", "Tech"], c.components.map((x) => [x.name, x.responsibility, x.tech])),
    H("Data model"),
    table(["Entity", "Key fields", "Notes"], c.dataModel.map((x) => [x.entity, x.fields, x.notes])),
    H("APIs / interfaces"),
    table(["Method", "Path", "Purpose", "Auth"], c.apis.map((x) => [x.method, x.path, x.purpose, x.auth])),

    H("Key flows"),
    P(c.keyFlows),
    H("Technology choices"),
    table(["Layer", "Choice", "Rationale"], c.techStack.map((x) => [x.layer, x.choice, x.rationale])),

    H("Security & privacy"),
    P(c.securityPrivacy),
    H("Scalability & performance"),
    P(c.scalabilityPerformance),
    H("Observability"),
    P(c.observability),

    H("Risks & tradeoffs"),
    table(["Risk", "Impact", "Mitigation"], c.risksTradeoffs.map((x) => [x.risk, x.impact, x.mitigation])),

    H("Testing strategy"),
    P(c.testingStrategy),
    H("Rollout plan"),
    P(c.rolloutPlan),
    H("Open questions"),
    ...bullets(c.openQuestions),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- PDF ----

export function buildTechDocPdf(d: TechDocDocData): Promise<Buffer> {
  const c = d.content;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (ch: Buffer) => chunks.push(ch));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 100;
    const h2 = (t: string) => { doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#111").text(t); doc.moveDown(0.2); doc.font("Helvetica").fontSize(10).fillColor("#333"); };
    const para = (t: string) => { doc.font("Helvetica").fontSize(10).fillColor("#333").text(t || "—", { width: W }); };
    const kv = (k: string, v: string) => { doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(`${k}: `, { continued: true }).font("Helvetica").fillColor("#333").text(v); };
    const list = (items: string[]) => {
      if (!items.length) { para("—"); return; }
      items.forEach((t) => doc.font("Helvetica").fontSize(10).fillColor("#333").text(`•  ${t}`, { width: W, indent: 4 }));
    };

    const drawTable = (headers: string[], rows: string[][], fractions: number[]) => {
      const startX = doc.page.margins.left;
      const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colW = fractions.map((f) => f * totalW);
      const pad = 5;
      const fs = 9;
      const headerFill = "#1F2937";
      const lineColor = "#C7CDD4";
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const rowH = (cells: string[], bold: boolean) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs);
        let mx = 12;
        cells.forEach((c2, i) => { const h = doc.heightOfString(c2 || "—", { width: colW[i] - 2 * pad }); if (h > mx) mx = h; });
        return mx + 2 * pad;
      };
      const drawRow = (cells: string[], y: number, h: number, fill: string | null, textColor: string, bold: boolean) => {
        let x = startX;
        cells.forEach((c2, i) => {
          if (fill) doc.save().rect(x, y, colW[i], h).fill(fill).restore();
          doc.lineWidth(0.5).strokeColor(lineColor).rect(x, y, colW[i], h).stroke();
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs).fillColor(textColor).text(c2 || "—", x + pad, y + pad, { width: colW[i] - 2 * pad });
          x += colW[i];
        });
      };
      const header = () => { const h = rowH(headers, true); const y = doc.y; drawRow(headers, y, h, headerFill, "#FFFFFF", true); doc.y = y + h; };
      if (doc.y + 44 > bottom()) doc.addPage();
      header();
      const body = rows.length ? rows : [headers.map(() => "—")];
      body.forEach((r) => {
        const h = rowH(r, false);
        if (doc.y + h > bottom()) { doc.addPage(); header(); }
        const y = doc.y;
        drawRow(r, y, h, null, "#333333", false);
        doc.y = y + h;
      });
      doc.x = startX;
      doc.moveDown(0.6);
    };

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(`Technical Design Document — ${d.projectName}`, { width: W });
    doc.moveDown(0.4);
    kv("Version", `v${d.version}${d.sourcePlaybookVersion ? ` · from playbook ${d.sourcePlaybookVersion}` : ""}`);
    kv("Approval status", approvalLine(d));
    kv("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`);
    if (d.groundedness != null) kv("Groundedness", `${d.groundedness}%`);
    if (d.tokens != null) kv("Tokens used", d.tokens.toLocaleString());

    h2("Approvals");
    if (d.approvers.length === 0) para("No approvers assigned.");
    else drawTable(["Approver", "Status"], d.approvers.map((a) => [a.name, a.approvedAt ? `Approved ${a.approvedAt.toLocaleString()}` : "Pending"]), [0.45, 0.55]);

    h2("Overview");
    para(c.overview);
    h2("Goals");
    list(c.goals);
    h2("Non-goals");
    list(c.nonGoals);
    h2("Architecture");
    para(c.architectureOverview);

    h2("Components");
    drawTable(["Component", "Responsibility", "Tech"], c.components.map((x) => [x.name, x.responsibility, x.tech]), [0.24, 0.46, 0.3]);
    h2("Data model");
    drawTable(["Entity", "Key fields", "Notes"], c.dataModel.map((x) => [x.entity, x.fields, x.notes]), [0.24, 0.38, 0.38]);
    h2("APIs / interfaces");
    drawTable(["Method", "Path", "Purpose", "Auth"], c.apis.map((x) => [x.method, x.path, x.purpose, x.auth]), [0.14, 0.26, 0.4, 0.2]);

    h2("Key flows");
    para(c.keyFlows);
    h2("Technology choices");
    drawTable(["Layer", "Choice", "Rationale"], c.techStack.map((x) => [x.layer, x.choice, x.rationale]), [0.22, 0.28, 0.5]);

    h2("Security & privacy");
    para(c.securityPrivacy);
    h2("Scalability & performance");
    para(c.scalabilityPerformance);
    h2("Observability");
    para(c.observability);

    h2("Risks & tradeoffs");
    drawTable(["Risk", "Impact", "Mitigation"], c.risksTradeoffs.map((x) => [x.risk, x.impact, x.mitigation]), [0.34, 0.22, 0.44]);

    h2("Testing strategy");
    para(c.testingStrategy);
    h2("Rollout plan");
    para(c.rolloutPlan);
    h2("Open questions");
    list(c.openQuestions);

    doc.end();
  });
}
