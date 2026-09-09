import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createEncounterSchema } from "../schemas/clinical";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";

export const encountersRouter = Router();
encountersRouter.use(requireAuth);

encountersRouter.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = createEncounterSchema.parse(req.body);
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, organizationId: req.organizationId! } });
    if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found.");

    const encounter = await prisma.encounter.create({
      data: {
        organizationId: req.organizationId!,
        patientId: data.patientId,
        clinicianId: req.user!.id,
        encounterType: data.encounterType,
        visitDate: new Date(data.visitDate),
        chiefComplaint: data.chiefComplaint ?? null,
        location: data.location ?? null,
      },
    });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "ENCOUNTER_CREATED", resourceType: "encounter", resourceId: encounter.id });
    res.status(201).json({ success: true, data: encounter });
  })
);

encountersRouter.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const encounter = await prisma.encounter.findFirst({
      where: { id: req.params.id, organizationId: req.organizationId! },
      include: { patient: true, clinician: { select: { id: true, fullName: true } }, audioRecordings: { include: { transcript: true } } },
    });
    if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found.");
    res.json({ success: true, data: encounter });
  })
);
