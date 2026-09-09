import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth);

auditLogsRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId: req.organizationId! },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { fullName: true, email: true } } },
      }),
      prisma.auditLog.count({ where: { organizationId: req.organizationId! } }),
    ]);
    res.json({ success: true, data: logs, meta: { page, pageSize, total } });
  })
);
