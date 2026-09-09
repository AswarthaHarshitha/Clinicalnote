import "dotenv/config";
import path from "node:path";
import os from "node:os";

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    // Intentionally not throwing at import time for provider keys — those are
    // validated lazily so the rest of the app can boot and report a clear
    // configuration state instead of crashing.
    return "";
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  sessionSecret: required("SESSION_SECRET", process.env.SESSION_SECRET),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  // "cloud" uses the hosted providers below. "local" is reserved for a future
  // self-hosted Whisper/Ollama runtime — see providers/local.ts.
  aiMode: (process.env.AI_MODE ?? "cloud") as "cloud" | "local",

  // Which implementation each provider boundary resolves to. Defaults favor
  // providers with a genuinely free tier so the app runs with ₹0 mandatory
  // API spend during development.
  transcription: {
    provider: process.env.TRANSCRIPTION_PROVIDER ?? "groq",
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? "gemini",
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    sttModel: process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo",
    llmModel: process.env.GROQ_LLM_MODEL ?? "llama-3.3-70b-versatile",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  },
  openai: {
    // Optional, non-mandatory provider — kept for orgs that want to switch to
    // a paid provider later without any code changes.
    apiKey: process.env.OPENAI_API_KEY ?? "",
    sttModel: process.env.OPENAI_STT_MODEL ?? "whisper-1",
    llmModel: process.env.OPENAI_LLM_MODEL ?? "gpt-4o-mini",
  },

  storeAudio: process.env.STORE_AUDIO === "true",
  maxAudioUploadMb: Number(process.env.MAX_AUDIO_UPLOAD_MB ?? 25),
  // Serverless platforms (Vercel included) only allow writes under the OS
  // temp dir — everywhere else the app is deployed, that's the same as the
  // configured/default relative path. Resolved to an absolute path so it
  // doesn't depend on the process's current working directory.
  storageDir: process.env.VERCEL
    ? path.join(os.tmpdir(), "clinicalnote-audio")
    : path.resolve(process.env.STORAGE_DIR ?? "./storage/audio"),
};
