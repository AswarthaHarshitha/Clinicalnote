import { describe, it, expect } from "vitest";
import { soapNoteSchema } from "./soap";

describe("soapNoteSchema", () => {
  it("accepts a fully-shaped SOAP note with empty/'not documented' values", () => {
    const result = soapNoteSchema.safeParse({
      subjective: { chiefComplaint: "", historyOfPresentIllness: "", symptoms: [], patientReportedHistory: "", relevantHistory: "" },
      objective: { vitalSigns: [], physicalExam: [], observations: [], labResults: [], imagingResults: [] },
      assessment: { summary: "", clinicalImpressions: [], differentialConsiderations: [] },
      plan: { medications: [], investigations: [], treatments: [], followUp: "", patientInstructions: "", referrals: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing a required section", () => {
    const result = soapNoteSchema.safeParse({
      subjective: { chiefComplaint: "", historyOfPresentIllness: "", symptoms: [], patientReportedHistory: "", relevantHistory: "" },
      objective: { vitalSigns: [], physicalExam: [], observations: [], labResults: [], imagingResults: [] },
      assessment: { summary: "", clinicalImpressions: [], differentialConsiderations: [] },
      // plan intentionally omitted
    });
    expect(result.success).toBe(false);
  });

  it("rejects a hallucinated field type (e.g. a medication list given as a single string)", () => {
    const result = soapNoteSchema.safeParse({
      subjective: { chiefComplaint: "", historyOfPresentIllness: "", symptoms: [], patientReportedHistory: "", relevantHistory: "" },
      objective: { vitalSigns: [], physicalExam: [], observations: [], labResults: [], imagingResults: [] },
      assessment: { summary: "", clinicalImpressions: [], differentialConsiderations: [] },
      plan: { medications: "Metformin 500mg", investigations: [], treatments: [], followUp: "", patientInstructions: "", referrals: [] },
    });
    expect(result.success).toBe(false);
  });
});
