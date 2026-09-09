import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";

export interface ExportNoteData {
  organizationName: string;
  patient: { identifier: string; fullName: string | null };
  encounter: { visitDate: Date; encounterType: string; chiefComplaint: string | null; location: string | null };
  clinician: { fullName: string; role: string };
  note: { id: string; status: string; noteType: string; version: number; updatedAt: Date };
  sections: Record<string, Record<string, unknown>>;
}

const SECTION_ORDER: Array<{ key: string; label: string }> = [
  { key: "subjective", label: "S — SUBJECTIVE" },
  { key: "objective", label: "O — OBJECTIVE" },
  { key: "assessment", label: "A — ASSESSMENT" },
  { key: "plan", label: "P — PLAN" },
];

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => `• ${v}`).join("\n") : "Not documented";
  }
  if (typeof value === "string") return value.trim() || "Not documented";
  return "Not documented";
}

function fieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function renderNoteToPlainText(data: ExportNoteData): string {
  const lines: string[] = [];
  lines.push(`CLINICAL NOTE`);
  lines.push(data.organizationName);
  lines.push("");
  lines.push(`Patient: ${data.patient.fullName ?? data.patient.identifier} (ID: ${data.patient.identifier})`);
  lines.push(`Encounter: ${data.encounter.encounterType} — ${data.encounter.visitDate.toDateString()}`);
  if (data.encounter.chiefComplaint) lines.push(`Chief complaint: ${data.encounter.chiefComplaint}`);
  if (data.encounter.location) lines.push(`Location: ${data.encounter.location}`);
  lines.push(`Clinician: ${data.clinician.fullName} (${data.clinician.role})`);
  lines.push(`Status: ${data.note.status} | Version: ${data.note.version} | Updated: ${data.note.updatedAt.toLocaleString()}`);
  lines.push("");
  for (const { key, label } of SECTION_ORDER) {
    lines.push(label);
    lines.push("-".repeat(label.length));
    const section = data.sections[key] ?? {};
    for (const [field, value] of Object.entries(section)) {
      lines.push(`${fieldLabel(field)}: ${formatValue(value)}`);
    }
    lines.push("");
  }
  lines.push(
    "ClinicalNote assists with documentation. It does not replace professional clinical judgment. Clinicians must review all generated content before it becomes part of the medical record."
  );
  return lines.join("\n");
}

export function renderNoteToPdf(data: ExportNoteData): PassThrough {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const stream = new PassThrough();
  doc.pipe(stream);

  doc.fontSize(18).fillColor("#24483F").text("Clinical Note", { align: "left" });
  doc.fontSize(10).fillColor("#737C78").text(data.organizationName);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#1E2724");
  doc.text(`Patient: ${data.patient.fullName ?? data.patient.identifier}  (ID: ${data.patient.identifier})`);
  doc.text(`Encounter: ${data.encounter.encounterType} — ${data.encounter.visitDate.toDateString()}`);
  if (data.encounter.chiefComplaint) doc.text(`Chief complaint: ${data.encounter.chiefComplaint}`);
  if (data.encounter.location) doc.text(`Location: ${data.encounter.location}`);
  doc.text(`Clinician: ${data.clinician.fullName} (${data.clinician.role})`);
  doc.text(`Status: ${data.note.status}   Version: ${data.note.version}   Updated: ${data.note.updatedAt.toLocaleString()}`);
  doc.moveDown();

  for (const { key, label } of SECTION_ORDER) {
    doc.moveDown(0.5);
    doc.fontSize(13).fillColor("#24483F").text(label, { underline: false });
    doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor("#DDE1DD").stroke();
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#1E2724");
    const section = data.sections[key] ?? {};
    for (const [field, value] of Object.entries(section)) {
      doc.font("Helvetica-Bold").text(`${fieldLabel(field)}:`, { continued: false });
      doc.font("Helvetica").text(formatValue(value));
      doc.moveDown(0.2);
    }
  }

  doc.moveDown();
  doc
    .fontSize(8)
    .fillColor("#737C78")
    .text(
      "ClinicalNote assists with documentation. It does not replace professional clinical judgment. Clinicians must review all generated content before it becomes part of the medical record.",
      { align: "left" }
    );

  doc.end();
  return stream;
}
