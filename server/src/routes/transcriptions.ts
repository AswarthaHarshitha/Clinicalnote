import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getSpeechToTextProvider, TranscriptionNotConfiguredError, TranscriptionFailedError } from "../providers/speechToText";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";
import { env } from "../config/env";

export const transcriptionsRouter = Router();
transcriptionsRouter.use(requireAuth);

const createSchema = z.object({ audioRecordingId: z.string().uuid() });

transcriptionsRouter.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { audioRecordingId } = createSchema.parse(req.body);

    const recording = await prisma.audioRecording.findFirst({
      where: { id: audioRecordingId, encounter: { organizationId: req.organizationId! } },
      include: { transcript: true },
    });
    if (!recording) throw new ApiError(404, "NOT_FOUND", "Audio recording not found.");
    if (!recording.storageKey || !fs.existsSync(recording.storageKey)) {
      throw new ApiError(410, "AUDIO_UNAVAILABLE", "The audio file is no longer available for transcription.");
    }

    const provider = getSpeechToTextProvider();
    if (!provider.isConfigured()) {
      throw new ApiError(503, "TRANSCRIPTION_NOT_CONFIGURED", provider.configurationMessage() ?? "AI service is not configured.");
    }

    const transcript = await prisma.transcript.upsert({
      where: { audioRecordingId },
      create: { audioRecordingId, text: "", provider: provider.name, status: "PROCESSING" },
      update: { status: "PROCESSING", errorMessage: null },
    });

    try {
      const result = await provider.transcribe(recording.storageKey, recording.mimeType);

      const updated = await prisma.transcript.update({
        where: { id: transcript.id },
        data: {
          text: result.text,
          language: result.language,
          durationSec: result.durationSec,
          confidence: result.confidence,
          provider: result.provider,
          status: "COMPLETED",
          errorMessage: null,
        },
      });

      // Honor data-minimization: discard the raw audio unless the org has
      // explicitly opted into retention.
      if (env.storeAudio) {
        const permanentPath = path.join(env.storageDir, path.basename(recording.storageKey));
        fs.renameSync(recording.storageKey, permanentPath);
        await prisma.audioRecording.update({ where: { id: recording.id }, data: { storageKey: permanentPath, durationSec: result.durationSec } });
      } else {
        fs.unlink(recording.storageKey, () => {});
        await prisma.audioRecording.update({ where: { id: recording.id }, data: { storageKey: null, durationSec: result.durationSec } });
      }

      await recordAudit({
        organizationId: req.organizationId,
        actorId: req.user?.id,
        action: "TRANSCRIPT_GENERATED",
        resourceType: "transcript",
        resourceId: updated.id,
        metadata: { provider: result.provider, durationSec: result.durationSec },
      });

      res.status(201).json({ success: true, data: updated });
    } catch (err) {
      const message =
        err instanceof TranscriptionNotConfiguredError
          ? err.message
          : err instanceof TranscriptionFailedError
          ? err.message
          : "Unable to transcribe the recording.";
      await prisma.transcript.update({ where: { id: transcript.id }, data: { status: "FAILED", errorMessage: message } });
      // Honor data minimization even on failure: don't leave the temp audio
      // file orphaned on disk when the org hasn't opted into retention.
      if (!env.storeAudio && recording.storageKey && fs.existsSync(recording.storageKey)) {
        fs.unlink(recording.storageKey, () => {});
        await prisma.audioRecording.update({ where: { id: recording.id }, data: { storageKey: null } }).catch(() => {});
      }
      throw new ApiError(502, "TRANSCRIPTION_FAILED", message);
    }
  })
);

transcriptionsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const transcript = await prisma.transcript.findFirst({
      where: { id: req.params.id, audioRecording: { encounter: { organizationId: req.organizationId! } } },
    });
    if (!transcript) throw new ApiError(404, "NOT_FOUND", "Transcript not found.");
    res.json({ success: true, data: transcript });
  })
);

const editSchema = z.object({ text: z.string().min(1) });

transcriptionsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { text } = editSchema.parse(req.body);
    const existing = await prisma.transcript.findFirst({
      where: { id: req.params.id, audioRecording: { encounter: { organizationId: req.organizationId! } } },
    });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Transcript not found.");
    const transcript = await prisma.transcript.update({ where: { id: existing.id }, data: { text, editedByUser: true } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "TRANSCRIPT_EDITED", resourceType: "transcript", resourceId: transcript.id });
    res.json({ success: true, data: transcript });
  })
);
