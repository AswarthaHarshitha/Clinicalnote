import { describe, it, expect } from "vitest";
import { detectTranscriptContradictions, evaluateSectionConfidence } from "./safetyCheck";
import { SoapNote } from "../schemas/soap";

function emptySoap(): SoapNote {
  return {
    subjective: { chiefComplaint: "", historyOfPresentIllness: "", symptoms: [], patientReportedHistory: "", relevantHistory: "" },
    objective: { vitalSigns: [], physicalExam: [], observations: [], labResults: [], imagingResults: [] },
    assessment: { summary: "", clinicalImpressions: [], differentialConsiderations: [] },
    plan: { medications: [], investigations: [], treatments: [], followUp: "", patientInstructions: "", referrals: [] },
  };
}

describe("detectTranscriptContradictions", () => {
  it("flags a denial and a later report of the same symptom", () => {
    const transcript = "Patient denies any fever. Later in the visit, patient reports fever for three days.";
    const flags = detectTranscriptContradictions(transcript);
    expect(flags.some((f) => f.code === "POTENTIAL_CONTRADICTION" && f.message.includes("fever"))).toBe(true);
  });

  it("does not flag a transcript with no contradiction", () => {
    const transcript = "Patient denies fever, cough, or nausea. Reports mild headache since yesterday.";
    const flags = detectTranscriptContradictions(transcript);
    expect(flags.length).toBe(0);
  });
});

describe("evaluateSectionConfidence", () => {
  it("marks subjective as review-recommended when chief complaint is missing", () => {
    const soap = emptySoap();
    const result = evaluateSectionConfidence(soap);
    expect(result.SUBJECTIVE.level).toBe("REVIEW_RECOMMENDED");
    expect(result.SUBJECTIVE.flags.some((f) => f.code === "MISSING_REQUIRED_FIELD")).toBe(true);
  });

  it("marks assessment as review-recommended when no diagnosis or impression documented", () => {
    const soap = emptySoap();
    const result = evaluateSectionConfidence(soap);
    expect(result.ASSESSMENT.level).toBe("REVIEW_RECOMMENDED");
  });

  it("marks a fully documented section as high confidence", () => {
    const soap = emptySoap();
    soap.subjective.chiefComplaint = "Sore throat";
    soap.subjective.historyOfPresentIllness = "Three days of sore throat and mild fever.";
    const result = evaluateSectionConfidence(soap);
    expect(result.SUBJECTIVE.level).toBe("HIGH");
  });

  it("never fabricates values — an empty plan stays empty, not invented", () => {
    const soap = emptySoap();
    const result = evaluateSectionConfidence(soap);
    expect(soap.plan.medications).toEqual([]);
    expect(result.PLAN.flags.some((f) => f.code === "NO_TREATMENT_DOCUMENTED")).toBe(true);
  });
});
