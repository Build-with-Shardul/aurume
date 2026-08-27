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
  AlignmentType,
} from "docx";
import PDFDocument from "pdfkit";
import type { PlaybookContent } from "./ai/playbook";

export type PlaybookDocData = {
  projectName: string;
  version: number;
  status: string; // draft | approved
  provider: string | null;
  model: string | null;
  groundedness: number | null;
  tokens: number | null;
  generatedAt: Date;
  content: PlaybookContent;
  approvers: Array<{ name: string; approvedAt: Date | null }>;
};

const TYPE_LABEL = (t: string) => (t === "scale" ? "Scale — existing feature to scale" : "Test — new feature to validate");
const fully = (d: PlaybookDocData) => d.approvers.length > 0 && d.approvers.every((a) => a.approvedAt);
const approvalLine = (d: PlaybookDocData) =>
  fully(d) ? "Approved" : d.status === "approved" ? "Approved" : d.approvers.length ? "Draft — pending approval" : "Draft — no approvers assigned";

// ---------------------------------------------------------------- DOCX ----

export async function buildPlaybookDocx(d: PlaybookDocData): Promise<Buffer> {
  const c = d.content;
  const H = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
  const P = (text: string) => new Paragraph({ children: [new TextRun(text || "—")], spacing: { after: 80 } });
  const meta = (label: string, val: string) => new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(val)], spacing: { after: 20 } });

  function table(headers: string[], rows: string[][]) {
    const border = { style: "single" as const, size: 4, color: "E5E5E5" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map((h) => new TableCell({ borders, shading: { fill: "F5F5F5" }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })] })),
    });
    const bodyRows = rows.length
      ? rows.map((r) => new TableRow({ children: r.map((c2) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: c2 || "—", size: 20 })] })] })) }))
      : [new TableRow({ children: headers.map(() => new TableCell({ borders, children: [P("—")] })) })];
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
  }

  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: `Product Playbook — ${d.projectName}`, bold: true, size: 32 })], spacing: { after: 80 } }),
    meta("Version", `v${d.version}`),
    meta("Approval status", approvalLine(d)),
    meta("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`),
    ...(d.groundedness != null ? [meta("Groundedness", `${d.groundedness}%`)] : []),
    ...(d.tokens != null ? [meta("Tokens used", d.tokens.toLocaleString())] : []),

    H("Approvals"),
    table(["Approver", "Status"], d.approvers.length ? d.approvers.map((a) => [a.name, a.approvedAt ? `Approved ${a.approvedAt.toLocaleString()}` : "Pending"]) : []),

    H("Project summary"),
    P(c.projectSummary),
    H("Key hypothesis"),
    P(c.keyHypothesis),
    H("Type"),
    P(TYPE_LABEL(c.projectType)),

    H("Key technology stakeholders"),
    table(["Name", "Team", "Project role"], c.techStakeholders.map((s) => [s.name, s.team, s.projectRole])),
    H("Key business stakeholders"),
    table(["Name", "Team", "Project role"], c.businessStakeholders.map((s) => [s.name, s.team, s.projectRole])),

    H("Project milestones"),
    table(["Milestone", "Target date"], c.milestones.map((m) => [m.milestone, m.targetDate])),

    H("In-scope epics"),
    table(["Jira", "Epic name", "Scope detail"], c.inScopeEpics.map((e) => [e.jiraId || e.jiraUrl || "—", e.name, e.scopeDetail])),

    H("Adoption support (markets)"),
    P(c.adoptionMarkets.join(", ")),

    H("Future scope"),
    P(c.futureScope),

    H("KPIs & measurement strategy"),
    table(["KPI / metric", "Target value", "Measurement strategy"], c.kpis.map((k) => [k.metric, k.targetValue, k.measurementStrategy])),

    H("Operational & change management"),
    P(c.operationalChangeManagement),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- PDF ----

export function buildPlaybookPdf(d: PlaybookDocData): Promise<Buffer> {
  const c = d.content;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (ch: Buffer) => chunks.push(ch));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 100; // content width
    const h2 = (t: string) => { doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#111").text(t); doc.moveDown(0.2); doc.font("Helvetica").fontSize(10).fillColor("#333"); };
    const para = (t: string) => { doc.font("Helvetica").fontSize(10).fillColor("#333").text(t || "—", { width: W }); };
    const kv = (k: string, v: string) => { doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(`${k}: `, { continued: true }).font("Helvetica").fillColor("#333").text(v); };
    const entry = (title: string, body?: string) => { doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text(`• ${title}`, { width: W }); if (body) doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(body, { width: W, indent: 12 }); doc.moveDown(0.2); };

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(`Product Playbook — ${d.projectName}`, { width: W });
    doc.moveDown(0.4);
    kv("Version", `v${d.version}`);
    kv("Approval status", approvalLine(d));
    kv("Generated", `${d.generatedAt.toLocaleString()}${d.provider && d.model ? ` · ${d.provider}/${d.model}` : ""}`);
    if (d.groundedness != null) kv("Groundedness", `${d.groundedness}%`);
    if (d.tokens != null) kv("Tokens used", d.tokens.toLocaleString());

    h2("Approvals");
    if (d.approvers.length === 0) para("No approvers assigned.");
    else d.approvers.forEach((a) => entry(a.name, a.approvedAt ? `Approved ${a.approvedAt.toLocaleString()}` : "Pending"));

    h2("Project summary");
    para(c.projectSummary);
    h2("Key hypothesis");
    para(c.keyHypothesis);
    h2("Type");
    para(TYPE_LABEL(c.projectType));

    h2("Key technology stakeholders");
    if (!c.techStakeholders.length) para("—");
    c.techStakeholders.forEach((s) => entry(s.name, `${s.team} — ${s.projectRole}`));
    h2("Key business stakeholders");
    if (!c.businessStakeholders.length) para("—");
    c.businessStakeholders.forEach((s) => entry(s.name, `${s.team} — ${s.projectRole}`));

    h2("Project milestones");
    if (!c.milestones.length) para("—");
    c.milestones.forEach((m) => entry(m.milestone, m.targetDate));

    h2("In-scope epics");
    if (!c.inScopeEpics.length) para("—");
    c.inScopeEpics.forEach((e) => entry(`${e.name}${e.jiraId ? ` [${e.jiraId}]` : ""}`, e.scopeDetail));

    h2("Adoption support (markets)");
    para(c.adoptionMarkets.join(", "));

    h2("Future scope");
    para(c.futureScope);

    h2("KPIs & measurement strategy");
    if (!c.kpis.length) para("—");
    c.kpis.forEach((k) => entry(k.metric, `Target: ${k.targetValue} · ${k.measurementStrategy}`));

    h2("Operational & change management");
    para(c.operationalChangeManagement);

    doc.end();
  });
}
