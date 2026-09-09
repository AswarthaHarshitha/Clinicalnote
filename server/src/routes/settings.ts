import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { hashPassword, verifyPassword, revokeAllSessions, SESSION_COOKIE_NAME } from "../services/authService";
import { passwordSchema } from "../schemas/auth";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const profileSchema = z.object({ fullName: z.string().trim().min(2), role: z.string().trim().min(2) });

settingsRouter.patch(
  "/profile",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = profileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "SETTINGS_CHANGED", resourceType: "user", resourceId: user.id, metadata: { field: "profile" } });
    res.json({ success: true, data: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  })
);

const organizationSchema = z.object({
  name: z.string().trim().min(2).optional(),
  requirePatientName: z.boolean().optional(),
  requireDob: z.boolean().optional(),
  defaultLanguage: z.string().trim().optional(),
  dateFormat: z.string().trim().optional(),
  storeAudio: z.boolean().optional(),
});

settingsRouter.patch(
  "/organization",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.membershipRole !== "OWNER" && req.membershipRole !== "ADMIN") {
      throw new ApiError(403, "FORBIDDEN", "Only organization owners or admins can change organization settings.");
    }
    const data = organizationSchema.parse(req.body);
    const organization = await prisma.organization.update({ where: { id: req.organizationId! }, data });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "SETTINGS_CHANGED", resourceType: "organization", resourceId: organization.id });
    res.json({ success: true, data: organization });
  })
);

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

settingsRouter.post(
  "/change-password",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }
    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "SETTINGS_CHANGED", resourceType: "user", resourceId: user.id, metadata: { field: "password" } });
    res.json({ success: true, data: null });
  })
);

settingsRouter.get(
  "/sessions",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    });
    res.json({ success: true, data: sessions });
  })
);

settingsRouter.post(
  "/sessions/revoke-all",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await revokeAllSessions(req.user!.id);
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "SETTINGS_CHANGED", resourceType: "user", resourceId: req.user?.id, metadata: { field: "sessions_revoked" } });
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true, data: null });
  })
);
