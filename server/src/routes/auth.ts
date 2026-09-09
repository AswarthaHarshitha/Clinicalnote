import { Router } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { registerSchema, loginSchema } from "../schemas/auth";
import { hashPassword, verifyPassword, createSession, revokeSession, SESSION_COOKIE_NAME } from "../services/authService";
import { env } from "../config/env";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";

export const authRouter = Router();

function cookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: remember ? 1000 * 60 * 60 * 24 * 14 : undefined, // session cookie if not "remember"
  };
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      throw new ApiError(409, "EMAIL_IN_USE", "An account with this email already exists.");
    }

    const passwordHash = await hashPassword(data.password);

    const { user, organizationId } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: data.organizationName } });
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          fullName: data.fullName,
          role: data.role,
        },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
      });
      return { user, organizationId: organization.id };
    });

    const { token, expiresAt } = await createSession(user.id, organizationId, req.get("user-agent") ?? undefined, req.ip);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(true));
    await recordAudit({ organizationId, actorId: user.id, action: "LOGIN", resourceType: "user", resourceId: user.id });

    res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, expiresAt },
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });

    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      await recordAudit({ action: "LOGIN_FAILED", resourceType: "user", metadata: { email: data.email.toLowerCase() } });
      throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }

    const membership = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    const { token, expiresAt } = await createSession(user.id, membership?.organizationId ?? null, req.get("user-agent") ?? undefined, req.ip);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(Boolean(data.remember)));
    await recordAudit({ organizationId: membership?.organizationId, actorId: user.id, action: "LOGIN", resourceType: "user", resourceId: user.id });

    res.json({ success: true, data: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, expiresAt } });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.sessionToken) await revokeSession(req.sessionToken);
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "LOGOUT", resourceType: "user", resourceId: req.user?.id });
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true, data: null });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const organization = await prisma.organization.findUnique({ where: { id: req.organizationId! } });
    res.json({
      success: true,
      data: {
        user: req.user,
        organization: organization ? { id: organization.id, name: organization.name } : null,
        role: req.membershipRole,
      },
    });
  })
);
