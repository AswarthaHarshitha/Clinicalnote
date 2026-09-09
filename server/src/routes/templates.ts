import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/clinical";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/apiError";

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

templatesRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const templates = await prisma.template.findMany({ where: { organizationId: req.organizationId! }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: templates });
  })
);

templatesRouter.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = createTemplateSchema.parse(req.body);
    if (data.isDefault) {
      await prisma.template.updateMany({ where: { organizationId: req.organizationId! }, data: { isDefault: false } });
    }
    const template = await prisma.template.create({ data: { ...data, organizationId: req.organizationId! } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "TEMPLATE_CREATED", resourceType: "template", resourceId: template.id });
    res.status(201).json({ success: true, data: template });
  })
);

templatesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = updateTemplateSchema.parse(req.body);
    const existing = await prisma.template.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Template not found.");
    if (data.isDefault) {
      await prisma.template.updateMany({ where: { organizationId: req.organizationId! }, data: { isDefault: false } });
    }
    const template = await prisma.template.update({ where: { id: existing.id }, data });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "TEMPLATE_UPDATED", resourceType: "template", resourceId: template.id });
    res.json({ success: true, data: template });
  })
);

templatesRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const existing = await prisma.template.findFirst({ where: { id: req.params.id, organizationId: req.organizationId! } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Template not found.");
    await prisma.template.delete({ where: { id: existing.id } });
    await recordAudit({ organizationId: req.organizationId, actorId: req.user?.id, action: "TEMPLATE_DELETED", resourceType: "template", resourceId: existing.id });
    res.json({ success: true, data: null });
  })
);
