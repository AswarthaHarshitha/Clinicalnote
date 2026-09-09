import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createPatientSchema, updatePatientSchema } from "../schemas/clinical";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";

export const patientsRouter = Router();
patientsRouter.use(requireAuth);

patientsRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));

    const where = {
      organizationId: req.organizationId!,
      ...(search
        ? {
            OR: [
              { identifier: { contains: search, mode: "insensitive" as const } },
              { fullName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({ success: true, data: patients, meta: { page, pageSize, total } });
  })
);

patientsRouter.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = createPatientSchema.parse(req.body);
    const existing = await prisma.patient.findUnique({
      where: { organizationId_identifier: { organizationId: req.organizationId!, identifier: data.identifier } },
    });
    if (existing) throw new ApiError(409, "PATIENT_EXISTS", "A patient with this identifier already exists.");

    const patient = await prisma.patient.create({
      data: {
        organizationId: req.organizationId!,
        identifier: data.identifier,
        fullName: data.fullName ?? null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      },
    });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "PATIENT_CREATED", resourceType: "patient", resourceId: patient.id });
    res.status(201).json({ success: true, data: patient });
  })
);

patientsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const patient = await prisma.patient.findFirst({
      where: { id: req.params.id, organizationId: req.organizationId! },
      include: {
        encounters: { orderBy: { visitDate: "desc" }, take: 25 },
        notes: { orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, status: true, noteType: true, updatedAt: true, createdAt: true } },
      },
    });
    if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found.");
    res.json({ success: true, data: patient });
  })
);

patientsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = updatePatientSchema.parse(req.body);
    const existing = await prisma.patient.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Patient not found.");

    const patient = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        ...(data.identifier !== undefined ? { identifier: data.identifier } : {}),
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null } : {}),
      },
    });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "PATIENT_UPDATED", resourceType: "patient", resourceId: patient.id });
    res.json({ success: true, data: patient });
  })
);
