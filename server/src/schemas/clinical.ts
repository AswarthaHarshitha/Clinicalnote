import { z } from "zod";

export const createPatientSchema = z.object({
  identifier: z.string().trim().min(1, "Patient identifier is required.").max(64),
  fullName: z.string().trim().max(200).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable().or(z.literal("").transform(() => null)),
});

export const updatePatientSchema = createPatientSchema.partial();

export const createEncounterSchema = z.object({
  patientId: z.string().uuid(),
  encounterType: z.enum([
    "INITIAL_CONSULTATION",
    "FOLLOW_UP",
    "TELEHEALTH",
    "PREVENTIVE_VISIT",
    "CHRONIC_CARE",
    "URGENT",
    "OTHER",
  ]),
  visitDate: z.string().datetime(),
  chiefComplaint: z.string().trim().max(2000).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
});

export const generateNoteSchema = z.object({
  transcriptId: z.string().uuid(),
  encounterId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  noteType: z.string().trim().max(100).optional(),
});

export const updateNoteSchema = z.object({
  status: z.enum(["DRAFT", "TRANSCRIBED", "AI_GENERATED", "IN_REVIEW", "FINALIZED", "ARCHIVED"]).optional(),
  sections: z
    .array(
      z.object({
        type: z.enum(["SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"]),
        content: z.record(z.any()),
      })
    )
    .optional(),
  changeSummary: z.string().trim().max(500).optional(),
});

export const regenerateSectionSchema = z.object({
  section: z.enum(["SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"]),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
  structure: z.record(z.any()),
});

export const updateTemplateSchema = createTemplateSchema.partial();
