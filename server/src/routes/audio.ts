import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuid } from "uuid";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { ApiError } from "../utils/apiError";
import { env } from "../config/env";

export const audioRouter = Router();
audioRouter.use(requireAuth);

export const SUPPORTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
];

fs.mkdirSync(env.storageDir, { recursive: true });
fs.mkdirSync(path.join(env.storageDir, "..", "tmp"), { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(env.storageDir, "..", "tmp")),
    filename: (_req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname) || ""}`),
  }),
  limits: { fileSize: env.maxAudioUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORTED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, "UNSUPPORTED_FORMAT", `Unsupported audio format: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

audioRouter.post(
  "/upload",
  upload.single("audio"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) throw new ApiError(400, "NO_FILE", "No audio file was provided.");
    const encounterId = req.body.encounterId as string | undefined;
    const sourceType = (req.body.sourceType as string) === "UPLOADED" ? "UPLOADED" : "RECORDED";
    if (!encounterId) {
      fs.unlink(req.file.path, () => {});
      throw new ApiError(400, "MISSING_ENCOUNTER", "encounterId is required.");
    }
    const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, organizationId: req.organizationId! } });
    if (!encounter) {
      fs.unlink(req.file.path, () => {});
      throw new ApiError(404, "NOT_FOUND", "Encounter not found.");
    }

    // The file is always written to a processing path first so it can be
    // handed to the transcription provider. Once transcription succeeds, the
    // transcriptions route deletes it (STORE_AUDIO=false) or promotes it into
    // permanent storage (STORE_AUDIO=true) — raw audio is never kept by default.
    const recording = await prisma.audioRecording.create({
      data: {
        encounterId,
        sourceType: sourceType as any,
        storageKey: req.file.path,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: recording.id,
        encounterId: recording.encounterId,
        mimeType: recording.mimeType,
        fileSizeBytes: recording.fileSizeBytes,
      },
    });
  })
);
