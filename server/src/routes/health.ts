import { Router } from "express";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { getSpeechToTextProvider } from "../providers/speechToText";
import { getClinicalNoteProvider } from "../providers/clinicalNote";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let databaseStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseStatus = "error";
  }

  const stt = getSpeechToTextProvider();
  const llm = getClinicalNoteProvider();

  const status = {
    database: databaseStatus,
    aiMode: env.aiMode,
    speechToText: stt.isConfigured() ? "configured" : "not_configured",
    speechToTextProvider: stt.name,
    speechToTextMessage: stt.configurationMessage(),
    llm: llm.isConfigured() ? "configured" : "not_configured",
    llmProvider: llm.name,
    llmMessage: llm.configurationMessage(),
  };

  const healthy = databaseStatus === "ok";
  res.status(healthy ? 200 : 503).json({ success: healthy, data: status });
});
