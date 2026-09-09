import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { generateNoteSchema, updateNoteSchema, regenerateSectionSchema } from "../schemas/clinical";
import { getClinicalNoteProvider, LlmNotConfiguredError, LlmOutputInvalidError, LlmGenerationFailedError } from "../providers/clinicalNote";
import { persistGeneratedNote, snapshotCurrentVersion } from "../services/noteService";
import { evaluateSectionConfidence } from "../services/safetyCheck";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";
import { renderNoteToPlainText, renderNoteToPdf } from "../services/exportService";
import { Prisma } from "@prisma/client";

export const clinicalNotesRouter = Router();
clinicalNotesRouter.use(requireAuth);

async function loadFullNote(id: string, organizationId: string) {
  return prisma.clinicalNote.findFirst({
    where: { id, organizationId },
    include: {
      patient: true,
      encounter: true,
      clinician: { select: { id: true, fullName: true, role: true } },
      transcript: true,
      template: true,
      sections: true,
    },
  });
}

clinicalNotesRouter.post(
  "/generate",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = generateNoteSchema.parse(req.body);

    const transcript = await prisma.transcript.findFirst({
      where: { id: data.transcriptId, audioRecording: { encounter: { organizationId: req.organizationId! } } },
      include: { audioRecording: { include: { encounter: true } } },
    });
    if (!transcript) throw new ApiError(404, "NOT_FOUND", "Transcript not found.");
    if (transcript.status !== "COMPLETED") throw new ApiError(409, "TRANSCRIPT_NOT_READY", "The transcript has not finished processing.");
    if (!transcript.text.trim()) throw new ApiError(422, "EMPTY_TRANSCRIPT", "The transcript is empty — nothing to structure.");

    const encounter = await prisma.encounter.findFirst({
      where: { id: data.encounterId, organizationId: req.organizationId! },
      include: { patient: true },
    });
    if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found.");

    const provider = getClinicalNoteProvider();
    if (!provider.isConfigured()) {
      throw new ApiError(503, "LLM_NOT_CONFIGURED", provider.configurationMessage() ?? "AI service is not configured.");
    }

    try {
      const soap = await provider.generateSoapNote(transcript.text, encounter.chiefComplaint);
      const note = await persistGeneratedNote({
        organizationId: req.organizationId!,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        clinicianId: req.user!.id,
        transcriptId: transcript.id,
        transcriptText: transcript.text,
        templateId: data.templateId ?? null,
        noteType: data.noteType,
        soap,
      });

      await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "SOAP_GENERATED", resourceType: "clinical_note", resourceId: note.id, metadata: { provider: provider.name } });

      const full = await loadFullNote(note.id, req.organizationId!);
      res.status(201).json({ success: true, data: full });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) throw new ApiError(503, "LLM_NOT_CONFIGURED", err.message);
      if (err instanceof LlmOutputInvalidError) throw new ApiError(502, "LLM_OUTPUT_INVALID", "The AI's structured output did not pass validation. Please try regenerating.");
      if (err instanceof LlmGenerationFailedError) throw new ApiError(502, "SOAP_GENERATION_FAILED", err.message);
      throw err;
    }
  })
);

clinicalNotesRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined;
    const encounterType = typeof req.query.encounterType === "string" && req.query.encounterType !== "ALL" ? req.query.encounterType : undefined;

    const where: Prisma.ClinicalNoteWhereInput = {
      organizationId: req.organizationId!,
      ...(status ? { status: status as any } : {}),
      ...(encounterType ? { encounter: { encounterType: encounterType as any } } : {}),
      ...(search
        ? {
            OR: [
              { patient: { identifier: { contains: search, mode: "insensitive" } } },
              { patient: { fullName: { contains: search, mode: "insensitive" } } },
              { noteType: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [notes, total] = await Promise.all([
      prisma.clinicalNote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          patient: { select: { identifier: true, fullName: true } },
          encounter: { select: { encounterType: true, visitDate: true } },
          clinician: { select: { fullName: true } },
        },
      }),
      prisma.clinicalNote.count({ where }),
    ]);

    res.json({ success: true, data: notes, meta: { page, pageSize, total } });
  })
);

clinicalNotesRouter.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const note = await loadFullNote(req.params.id, req.organizationId!);
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    res.json({ success: true, data: note });
  })
);

clinicalNotesRouter.get(
  "/:id/versions",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const note = await prisma.clinicalNote.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    const versions = await prisma.clinicalNoteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { versionNumber: "desc" },
      include: { author: { select: { fullName: true } } },
    });
    res.json({ success: true, data: versions });
  })
);

clinicalNotesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = updateNoteSchema.parse(req.body);
    const note = await prisma.clinicalNote.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    if (note.status === "FINALIZED" || note.status === "ARCHIVED") {
      throw new ApiError(409, "NOTE_LOCKED", "This note is finalized and is read-only. Amendments must be made as a new encounter note.");
    }

    if (data.sections?.length) {
      await snapshotCurrentVersion(note.id, req.user!.id, data.changeSummary?.trim() || "Manual edit");
      for (const section of data.sections) {
        await prisma.soapSection.update({
          where: { noteId_type: { noteId: note.id, type: section.type } },
          data: { content: section.content as Prisma.InputJsonValue, isEdited: true },
        });
      }
      await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "NOTE_EDITED", resourceType: "clinical_note", resourceId: note.id, metadata: { sections: data.sections.map((s) => s.type) } });
    }

    if (data.status && data.status !== note.status) {
      if (data.status === "FINALIZED") throw new ApiError(400, "USE_FINALIZE_ENDPOINT", "Use POST /:id/finalize to finalize a note.");
      if (data.status === "ARCHIVED") throw new ApiError(400, "USE_ARCHIVE_ENDPOINT", "Use POST /:id/archive to archive a note.");
      await prisma.clinicalNote.update({ where: { id: note.id }, data: { status: data.status } });
    }

    await prisma.clinicalNote.update({ where: { id: note.id }, data: { lastSavedAt: new Date() } });
    const full = await loadFullNote(note.id, req.organizationId!);
    res.json({ success: true, data: full });
  })
);

clinicalNotesRouter.post(
  "/:id/regenerate-section",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { section } = regenerateSectionSchema.parse(req.body);
    const note = await prisma.clinicalNote.findFirst({
      where: { id: req.params.id, organizationId: req.organizationId! },
      include: { transcript: true, encounter: true },
    });
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    if (note.status === "FINALIZED" || note.status === "ARCHIVED") throw new ApiError(409, "NOTE_LOCKED", "This note is finalized and is read-only.");
    if (!note.transcript) throw new ApiError(409, "NO_TRANSCRIPT", "This note has no associated transcript to regenerate from.");

    const provider = getClinicalNoteProvider();
    if (!provider.isConfigured()) throw new ApiError(503, "LLM_NOT_CONFIGURED", provider.configurationMessage() ?? "AI service is not configured.");

    try {
      const regenerated = await provider.regenerateSection(section, note.transcript.text, note.encounter.chiefComplaint);
      await snapshotCurrentVersion(note.id, req.user!.id, `Regenerated ${section} section`);

      // Re-derive confidence for the regenerated section using a minimal SOAP shell.
      const shell = { subjective: {}, objective: {}, assessment: {}, plan: {}, [section.toLowerCase()]: regenerated } as any;
      const confidence = evaluateSectionConfidence(shell)[section];

      const updated = await prisma.soapSection.update({
        where: { noteId_type: { noteId: note.id, type: section } },
        data: {
          content: regenerated as Prisma.InputJsonValue,
          confidence: confidence.level,
          flags: confidence.flags as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
          isEdited: false,
        },
      });

      await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "NOTE_SECTION_REGENERATED", resourceType: "clinical_note", resourceId: note.id, metadata: { section } });
      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) throw new ApiError(503, "LLM_NOT_CONFIGURED", err.message);
      if (err instanceof LlmOutputInvalidError) throw new ApiError(502, "LLM_OUTPUT_INVALID", "The AI's structured output did not pass validation.");
      if (err instanceof LlmGenerationFailedError) throw new ApiError(502, "SOAP_GENERATION_FAILED", err.message);
      throw err;
    }
  })
);

clinicalNotesRouter.post(
  "/:id/finalize",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const note = await prisma.clinicalNote.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! }, include: { sections: true } });
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    if (note.status === "FINALIZED" || note.status === "ARCHIVED") throw new ApiError(409, "ALREADY_FINALIZED", "This note is already finalized.");
    if (note.sections.length < 4) throw new ApiError(422, "INCOMPLETE_NOTE", "All four SOAP sections must exist before finalizing.");

    await snapshotCurrentVersion(note.id, req.user!.id, "Finalized by clinician");
    const updated = await prisma.clinicalNote.update({ where: { id: note.id }, data: { status: "FINALIZED", finalizedAt: new Date() } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "NOTE_FINALIZED", resourceType: "clinical_note", resourceId: note.id });
    res.json({ success: true, data: updated });
  })
);

clinicalNotesRouter.post(
  "/:id/archive",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const note = await prisma.clinicalNote.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    if (note.status !== "FINALIZED") throw new ApiError(409, "NOT_FINALIZED", "Only finalized notes can be archived.");

    const updated = await prisma.clinicalNote.update({ where: { id: note.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "NOTE_ARCHIVED", resourceType: "clinical_note", resourceId: note.id });
    res.json({ success: true, data: updated });
  })
);

clinicalNotesRouter.get(
  "/:id/export",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const format = (req.query.format as string) ?? "text";
    const note = await loadFullNote(req.params.id, req.organizationId!);
    if (!note) throw new ApiError(404, "NOT_FOUND", "Clinical note not found.");
    const organization = await prisma.organization.findUnique({ where: { id: req.organizationId! } });

    const sections: Record<string, Record<string, unknown>> = {};
    for (const s of note.sections) sections[s.type.toLowerCase()] = s.content as Record<string, unknown>;

    const exportData = {
      organizationName: organization?.name ?? "Clinic",
      patient: { identifier: note.patient.identifier, fullName: note.patient.fullName },
      encounter: { visitDate: note.encounter.visitDate, encounterType: note.encounter.encounterType, chiefComplaint: note.encounter.chiefComplaint, location: note.encounter.location },
      clinician: { fullName: note.clinician.fullName, role: note.clinician.role },
      note: { id: note.id, status: note.status, noteType: note.noteType, version: note.currentVersion, updatedAt: note.updatedAt },
      sections,
    };

    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "EXPORT_PERFORMED", resourceType: "clinical_note", resourceId: note.id, metadata: { format } });

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="clinical-note-${note.id}.pdf"`);
      renderNoteToPdf(exportData).pipe(res);
      return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="clinical-note-${note.id}.txt"`);
    res.send(renderNoteToPlainText(exportData));
  })
);
