import { SoapNote } from "../schemas/soap";

export interface SafetyFlag {
  severity: "warning" | "info";
  code: string;
  message: string;
}

export interface SectionConfidence {
  level: "HIGH" | "REVIEW_RECOMMENDED" | "MISSING_INFORMATION";
  flags: SafetyFlag[];
}

// Deterministic (non-LLM) checks. These never decide clinical truth — they
// only surface things for the clinician to look at before finalizing.

const NEGATION_PATTERNS: Array<{ symptom: RegExp; denial: RegExp; label: string }> = [
  { symptom: /\bfever\b/i, denial: /\bden(y|ies|ied)\s+(?:any\s+)?fever\b/i, label: "fever" },
  { symptom: /\bpain\b/i, denial: /\bden(y|ies|ied)\s+(?:any\s+)?pain\b/i, label: "pain" },
  { symptom: /\bnausea\b/i, denial: /\bden(y|ies|ied)\s+(?:any\s+)?nausea\b/i, label: "nausea" },
  { symptom: /\bshortness of breath\b/i, denial: /\bden(y|ies|ied)\s+(?:any\s+)?shortness of breath\b/i, label: "shortness of breath" },
  { symptom: /\bcough\b/i, denial: /\bden(y|ies|ied)\s+(?:any\s+)?cough\b/i, label: "cough" },
];

export function detectTranscriptContradictions(transcript: string): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  for (const { symptom, denial, label } of NEGATION_PATTERNS) {
    if (denial.test(transcript) && symptom.test(transcript.replace(denial, ""))) {
      flags.push({
        severity: "warning",
        code: "POTENTIAL_CONTRADICTION",
        message: `Potential contradiction detected regarding "${label}" — the transcript both denies and reports it. Clinician review required.`,
      });
    }
  }
  return flags;
}

function isEmpty(value: string | undefined | null): boolean {
  return !value || value.trim().length === 0 || /^not documented$/i.test(value.trim());
}

export function evaluateSectionConfidence(soap: SoapNote): Record<string, SectionConfidence> {
  const result: Record<string, SectionConfidence> = {};

  // Subjective
  {
    const flags: SafetyFlag[] = [];
    if (isEmpty(soap.subjective.chiefComplaint)) flags.push(missing("chief complaint"));
    if (isEmpty(soap.subjective.historyOfPresentIllness)) flags.push(missing("history of present illness"));
    result.SUBJECTIVE = { level: levelFor(flags), flags };
  }
  // Objective
  {
    const flags: SafetyFlag[] = [];
    if (soap.objective.vitalSigns.length === 0 && soap.objective.physicalExam.length === 0 && soap.objective.observations.length === 0) {
      flags.push({ severity: "info", code: "NO_OBJECTIVE_DATA", message: "No objective findings were documented in the source transcript." });
    }
    result.OBJECTIVE = { level: levelFor(flags), flags };
  }
  // Assessment
  {
    const flags: SafetyFlag[] = [];
    if (isEmpty(soap.assessment.summary) && soap.assessment.clinicalImpressions.length === 0) {
      flags.push({ severity: "warning", code: "NO_DOCUMENTED_DIAGNOSIS", message: "No diagnosis or clinical impression was documented — this is stated rather than inferred." });
    }
    result.ASSESSMENT = { level: levelFor(flags), flags };
  }
  // Plan
  {
    const flags: SafetyFlag[] = [];
    if (isEmpty(soap.plan.followUp)) {
      flags.push({ severity: "info", code: "MISSING_FOLLOW_UP", message: "No follow-up plan was documented." });
    }
    if (soap.plan.medications.length === 0 && soap.plan.treatments.length === 0) {
      flags.push({ severity: "info", code: "NO_TREATMENT_DOCUMENTED", message: "No medications or treatments were documented." });
    }
    result.PLAN = { level: levelFor(flags), flags };
  }

  return result;
}

function missing(field: string): SafetyFlag {
  return { severity: "warning", code: "MISSING_REQUIRED_FIELD", message: `${field[0].toUpperCase()}${field.slice(1)} was not documented in the transcript.` };
}

function levelFor(flags: SafetyFlag[]): SectionConfidence["level"] {
  if (flags.some((f) => f.severity === "warning")) return "REVIEW_RECOMMENDED";
  if (flags.length > 0) return "MISSING_INFORMATION";
  return "HIGH";
}
