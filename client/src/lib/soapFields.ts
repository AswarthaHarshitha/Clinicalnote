export type SectionType = "SUBJECTIVE" | "OBJECTIVE" | "ASSESSMENT" | "PLAN";

export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "list";
}

export const SECTION_FIELDS: Record<SectionType, FieldSpec[]> = {
  SUBJECTIVE: [
    { key: "chiefComplaint", label: "Chief complaint", kind: "text" },
    { key: "historyOfPresentIllness", label: "History of present illness", kind: "text" },
    { key: "symptoms", label: "Symptoms", kind: "list" },
    { key: "patientReportedHistory", label: "Patient-reported history", kind: "text" },
    { key: "relevantHistory", label: "Relevant history", kind: "text" },
  ],
  OBJECTIVE: [
    { key: "vitalSigns", label: "Vital signs", kind: "list" },
    { key: "physicalExam", label: "Physical exam", kind: "list" },
    { key: "observations", label: "Observations", kind: "list" },
    { key: "labResults", label: "Lab results", kind: "list" },
    { key: "imagingResults", label: "Imaging results", kind: "list" },
  ],
  ASSESSMENT: [
    { key: "summary", label: "Summary", kind: "text" },
    { key: "clinicalImpressions", label: "Clinical impressions", kind: "list" },
    { key: "differentialConsiderations", label: "Differential considerations", kind: "list" },
  ],
  PLAN: [
    { key: "medications", label: "Medications", kind: "list" },
    { key: "investigations", label: "Investigations", kind: "list" },
    { key: "treatments", label: "Treatments", kind: "list" },
    { key: "followUp", label: "Follow-up", kind: "text" },
    { key: "patientInstructions", label: "Patient instructions", kind: "text" },
    { key: "referrals", label: "Referrals", kind: "list" },
  ],
};

export const SECTION_LABELS: Record<SectionType, string> = {
  SUBJECTIVE: "S — Subjective",
  OBJECTIVE: "O — Objective",
  ASSESSMENT: "A — Assessment",
  PLAN: "P — Plan",
};

export function fieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function formatFieldValue(kind: FieldSpec["kind"], value: unknown): string {
  if (kind === "list") return Array.isArray(value) ? value.join("\n") : "";
  return typeof value === "string" ? value : "";
}

export function parseFieldValue(kind: FieldSpec["kind"], raw: string): string | string[] {
  if (kind === "list") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return raw;
}

export function displayValue(kind: FieldSpec["kind"], value: unknown): string {
  if (kind === "list") {
    const arr = Array.isArray(value) ? value : [];
    return arr.length ? arr.join("\n") : "Not documented";
  }
  const text = typeof value === "string" ? value.trim() : "";
  return text || "Not documented";
}
