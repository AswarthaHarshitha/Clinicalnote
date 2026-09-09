import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { resolveSession, SESSION_COOKIE_NAME } from "../services/authService";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; fullName: string; role: string };
  sessionToken?: string;
  organizationId?: string;
  membershipRole?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
  }
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ success: false, error: { code: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." } });
  }
  req.user = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role,
  };
  req.sessionToken = token;

  // Resolve the active organization strictly from the server-side session
  // record — the client never gets to assert its own organization ID.
  let organizationId = session.organizationId;
  if (!organizationId) {
    const membership = await prisma.membership.findFirst({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });
    organizationId = membership?.organizationId ?? null;
  }
  if (organizationId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: session.user.id, organizationId } },
    });
    if (membership) {
      req.organizationId = membership.organizationId;
      req.membershipRole = membership.role;
    }
  }

  if (!req.organizationId) {
    return res.status(403).json({ success: false, error: { code: "NO_ORGANIZATION", message: "Your account is not linked to an organization." } });
  }

  next();
}
