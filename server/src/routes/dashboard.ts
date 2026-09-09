import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// Every figure here is a real aggregate over this organization's own rows —
// there is no seeded or synthetic data behind any of these numbers.
dashboardRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const organizationId = req.organizationId!;
    const [total, awaitingReview, finalized, drafts, recentNotes] = await Promise.all([
      prisma.clinicalNote.count({ where: { organizationId } }),
      prisma.clinicalNote.count({ where: { organizationId, status: { in: ["AI_GENERATED", "IN_REVIEW"] } } }),
      prisma.clinicalNote.count({ where: { organizationId, status: "FINALIZED" } }),
      prisma.clinicalNote.count({ where: { organizationId, status: "DRAFT" } }),
      prisma.clinicalNote.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: {
          patient: { select: { identifier: true, fullName: true } },
          encounter: { select: { encounterType: true, visitDate: true } },
          clinician: { select: { fullName: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        metrics: { totalNotes: total, awaitingReview, finalized, drafts },
        recentNotes,
      },
    });
  })
);
