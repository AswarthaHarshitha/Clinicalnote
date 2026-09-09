import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { patientsRouter } from "./routes/patients";
import { encountersRouter } from "./routes/encounters";
import { audioRouter } from "./routes/audio";
import { transcriptionsRouter } from "./routes/transcriptions";
import { clinicalNotesRouter } from "./routes/clinicalNotes";
import { templatesRouter } from "./routes/templates";
import { auditLogsRouter } from "./routes/auditLogs";
import { dashboardRouter } from "./routes/dashboard";
import { healthRouter } from "./routes/health";
import { settingsRouter } from "./routes/settings";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

// General API rate limit; auth endpoints get a tighter limit against
// credential stuffing / brute force.
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/encounters", encountersRouter);
app.use("/api/audio", audioRouter);
app.use("/api/transcriptions", transcriptionsRouter);
app.use("/api/clinical-notes", clinicalNotesRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/settings", settingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

if (env.nodeEnv !== "test") {
  app.listen(env.port, () => {
    console.log(`Clinote API listening on port ${env.port}`);
  });
}

export { app };
