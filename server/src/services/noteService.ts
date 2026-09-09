import { prisma } from "../config/prisma";
import { SoapNote, SoapSectionKey } from "../schemas/soap";
import { evaluateSectionConfidence, detectTranscriptContradictions, SafetyFlag } from "./safetyCheck";
import { Prisma } from "@prisma/client";

const SECTION_KEYS: SoapSectionKey[] = ["SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"];

function sectionContent(soap: SoapNote, key: SoapSectionKey) {
  return soap[key.toLowerCase() as Lowercase<SoapSectionKey>];
}

export async function persistGeneratedNote(params: {
  organizationId: string;
  patientId: string;
  encounterId: string;
  clinicianId: string;
  transcriptId: string;
  transcriptText: string;
  templateId?: string | null;
  noteType?: string;
  soap: SoapNote;
}) {
  const confidenceBySection = evaluateSectionConfidence(params.soap);
  const transcriptFlags = detectTranscriptContradictions(params.transcriptText);

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.clinicalNote.create({
      data: {
        organizationId: params.organizationId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        clinicianId: params.clinicianId,
        transcriptId: params.transcriptId,
        templateId: params.templateId ?? null,
        noteType: params.noteType ?? "General Consultation",
        status: "AI_GENERATED",
        currentVersion: 1,
        lastSavedAt: new Date(),
      },
    });

    for (const key of SECTION_KEYS) {
      const confidence = confidenceBySection[key];
      const flags: SafetyFlag[] = key === "SUBJECTIVE" ? [...confidence.flags, ...transcriptFlags] : confidence.flags;
      await tx.soapSection.create({
        data: {
          noteId: created.id,
          type: key,
          content: sectionContent(params.soap, key) as Prisma.InputJsonValue,
          confidence: confidence.level,
          flags: flags as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
          isEdited: false,
        },
      });
    }

    await tx.clinicalNoteVersion.create({
      data: {
        noteId: created.id,
        versionNumber: 1,
        authorId: params.clinicianId,
        changeSummary: "AI-generated SOAP note from reviewed transcript.",
        snapshot: { status: "AI_GENERATED", soap: params.soap } as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  return note;
}

export async function snapshotCurrentVersion(noteId: string, authorId: string | null, changeSummary: string) {
  const note = await prisma.clinicalNote.findUniqueOrThrow({ where: { id: noteId }, include: { sections: true } });
  const soap: Record<string, unknown> = {};
  for (const section of note.sections) {
    soap[section.type.toLowerCase()] = section.content;
  }
  const nextVersion = note.currentVersion + 1;
  await prisma.$transaction([
    prisma.clinicalNoteVersion.create({
      data: {
        noteId,
        versionNumber: nextVersion,
        authorId,
        changeSummary,
        snapshot: { status: note.status, soap } as Prisma.InputJsonValue,
      },
    }),
    prisma.clinicalNote.update({ where: { id: noteId }, data: { currentVersion: nextVersion, lastSavedAt: new Date() } }),
  ]);
  return nextVersion;
}
