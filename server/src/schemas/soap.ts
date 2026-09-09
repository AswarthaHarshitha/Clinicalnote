import { z } from "zod";

// Strict SOAP structure returned by the LLM provider. Absence of information
// must be represented explicitly (null / [] / "Not documented") — the schema
// has no optional fields so the model cannot silently omit a section instead
// of stating that it is not documented.

export const subjectiveSchema = z.object({
  chiefComplaint: z.string(),
  historyOfPresentIllness: z.string(),
  symptoms: z.array(z.string()),
  patientReportedHistory: z.string(),
  relevantHistory: z.string(),
});

export const objectiveSchema = z.object({
  vitalSigns: z.array(z.string()),
  physicalExam: z.array(z.string()),
  observations: z.array(z.string()),
  labResults: z.array(z.string()),
  imagingResults: z.array(z.string()),
});

export const assessmentSchema = z.object({
  summary: z.string(),
  clinicalImpressions: z.array(z.string()),
  differentialConsiderations: z.array(z.string()),
});

export const planSchema = z.object({
  medications: z.array(z.string()),
  investigations: z.array(z.string()),
  treatments: z.array(z.string()),
  followUp: z.string(),
  patientInstructions: z.string(),
  referrals: z.array(z.string()),
});

export const soapNoteSchema = z.object({
  subjective: subjectiveSchema,
  objective: objectiveSchema,
  assessment: assessmentSchema,
  plan: planSchema,
});

export type SoapNote = z.infer<typeof soapNoteSchema>;
export type SubjectiveSection = z.infer<typeof subjectiveSchema>;
export type ObjectiveSection = z.infer<typeof objectiveSchema>;
export type AssessmentSection = z.infer<typeof assessmentSchema>;
export type PlanSection = z.infer<typeof planSchema>;

export const SOAP_SECTION_SCHEMAS = {
  SUBJECTIVE: subjectiveSchema,
  OBJECTIVE: objectiveSchema,
  ASSESSMENT: assessmentSchema,
  PLAN: planSchema,
} as const;

export type SoapSectionKey = keyof typeof SOAP_SECTION_SCHEMAS;

// JSON Schema handed to the LLM provider for structured-output enforcement.
export const soapJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subjective: {
      type: "object",
      additionalProperties: false,
      properties: {
        chiefComplaint: { type: "string" },
        historyOfPresentIllness: { type: "string" },
        symptoms: { type: "array", items: { type: "string" } },
        patientReportedHistory: { type: "string" },
        relevantHistory: { type: "string" },
      },
      required: ["chiefComplaint", "historyOfPresentIllness", "symptoms", "patientReportedHistory", "relevantHistory"],
    },
    objective: {
      type: "object",
      additionalProperties: false,
      properties: {
        vitalSigns: { type: "array", items: { type: "string" } },
        physicalExam: { type: "array", items: { type: "string" } },
        observations: { type: "array", items: { type: "string" } },
        labResults: { type: "array", items: { type: "string" } },
        imagingResults: { type: "array", items: { type: "string" } },
      },
      required: ["vitalSigns", "physicalExam", "observations", "labResults", "imagingResults"],
    },
    assessment: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        clinicalImpressions: { type: "array", items: { type: "string" } },
        differentialConsiderations: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "clinicalImpressions", "differentialConsiderations"],
    },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        medications: { type: "array", items: { type: "string" } },
        investigations: { type: "array", items: { type: "string" } },
        treatments: { type: "array", items: { type: "string" } },
        followUp: { type: "string" },
        patientInstructions: { type: "string" },
        referrals: { type: "array", items: { type: "string" } },
      },
      required: ["medications", "investigations", "treatments", "followUp", "patientInstructions", "referrals"],
    },
  },
  required: ["subjective", "objective", "assessment", "plan"],
} as const;

// Field "kind" per section — used only to structurally repair a response
// that omitted a key entirely (fills it with the schema-correct empty value:
// "" or []). This never invents clinical content; it only completes shape so
// a model that dropped a required key doesn't fail validation outright.
type FieldKind = "text" | "list";
const SECTION_FIELD_KINDS: Record<SoapSectionKey, Record<string, FieldKind>> = {
  SUBJECTIVE: { chiefComplaint: "text", historyOfPresentIllness: "text", symptoms: "list", patientReportedHistory: "text", relevantHistory: "text" },
  OBJECTIVE: { vitalSigns: "list", physicalExam: "list", observations: "list", labResults: "list", imagingResults: "list" },
  ASSESSMENT: { summary: "text", clinicalImpressions: "list", differentialConsiderations: "list" },
  PLAN: { medications: "list", investigations: "list", treatments: "list", followUp: "text", patientInstructions: "text", referrals: "list" },
};

function repairSection(section: SoapSectionKey, value: unknown): Record<string, unknown> {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  for (const [field, kind] of Object.entries(SECTION_FIELD_KINDS[section])) {
    if (!(field in obj)) obj[field] = kind === "list" ? [] : "";
  }
  return obj;
}

/** Structurally repairs a full SOAP payload: fills any entirely-missing keys
 * with their schema-correct empty value. Does not touch keys that are
 * already present, even if their type is wrong — that case is a real
 * validation failure, not something to paper over. */
export function repairSoapNoteShape(raw: unknown): unknown {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    subjective: repairSection("SUBJECTIVE", obj.subjective),
    objective: repairSection("OBJECTIVE", obj.objective),
    assessment: repairSection("ASSESSMENT", obj.assessment),
    plan: repairSection("PLAN", obj.plan),
  };
}

/** Same structural repair, scoped to a single section's payload. */
export function repairSoapSectionShape(section: SoapSectionKey, raw: unknown): unknown {
  return repairSection(section, raw);
}
