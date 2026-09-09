import fs from "node:fs";
import OpenAI from "openai";
import { env } from "../config/env";

export interface TranscriptResult {
  text: string;
  language: string | null;
  durationSec: number | null;
  confidence: number | null;
  provider: string;
}

export class TranscriptionNotConfiguredError extends Error {
  constructor(message = "Speech-to-text provider is not configured.") {
    super(message);
    this.name = "TranscriptionNotConfiguredError";
  }
}

export class TranscriptionFailedError extends Error {
  constructor(cause: unknown) {
    super(`Transcription request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TranscriptionFailedError";
  }
}

function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|overloaded|high demand|rate limit)\b/i.test(message);
}

/** Retries a real provider call on transient capacity errors (503/429/
 * "overloaded") with short exponential backoff. Free-tier endpoints see
 * genuine capacity spikes; this absorbs those without ever substituting a
 * fake transcript — if every attempt fails, the real final error is thrown. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 900): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts - 1 || !isTransientError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

// Replaceable provider boundary — swap the implementation (Groq, OpenAI, a
// self-hosted Whisper deployment...) without touching any calling code.
export interface SpeechToTextProvider {
  readonly name: string;
  isConfigured(): boolean;
  configurationMessage(): string | null;
  transcribe(filePath: string, mimeType: string): Promise<TranscriptResult>;
}

// Groq exposes an OpenAI-compatible speech-to-text endpoint, so the official
// `openai` SDK is reused here pointed at Groq's base URL instead of OpenAI's.
export class GroqSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "groq-whisper";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.groq.apiKey, baseURL: "https://api.groq.com/openai/v1" });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return env.groq.apiKey.length > 0;
  }

  configurationMessage(): string | null {
    return this.isConfigured() ? null : "Groq speech-to-text is not configured. Set GROQ_API_KEY (free tier available at console.groq.com).";
  }

  async transcribe(filePath: string): Promise<TranscriptResult> {
    if (!this.isConfigured()) throw new TranscriptionNotConfiguredError(this.configurationMessage()!);
    try {
      const client = this.getClient();
      // A fresh read stream is required per attempt — streams cannot be replayed on retry.
      const response = await withRetry(() =>
        client.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: env.groq.sttModel,
          response_format: "verbose_json",
        })
      );

      const anyResponse = response as unknown as { text: string; language?: string; duration?: number };
      return {
        text: anyResponse.text ?? "",
        language: anyResponse.language ?? null,
        durationSec: typeof anyResponse.duration === "number" ? anyResponse.duration : null,
        confidence: null, // Groq's Whisper endpoint does not return an overall confidence score.
        provider: this.name,
      };
    } catch (err) {
      throw new TranscriptionFailedError(err);
    }
  }
}

export class OpenAIWhisperProvider implements SpeechToTextProvider {
  readonly name = "openai-whisper";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.openai.apiKey });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return env.openai.apiKey.length > 0;
  }

  configurationMessage(): string | null {
    return this.isConfigured() ? null : "OpenAI speech-to-text is not configured. Set OPENAI_API_KEY.";
  }

  async transcribe(filePath: string): Promise<TranscriptResult> {
    if (!this.isConfigured()) throw new TranscriptionNotConfiguredError(this.configurationMessage()!);
    try {
      const client = this.getClient();
      const response = await withRetry(() =>
        client.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: env.openai.sttModel,
          response_format: "verbose_json",
        })
      );
      const anyResponse = response as unknown as { text: string; language?: string; duration?: number };
      return {
        text: anyResponse.text ?? "",
        language: anyResponse.language ?? null,
        durationSec: typeof anyResponse.duration === "number" ? anyResponse.duration : null,
        confidence: null,
        provider: this.name,
      };
    } catch (err) {
      throw new TranscriptionFailedError(err);
    }
  }
}

// AI_MODE=local is reserved for a future self-hosted Whisper runtime. It is
// intentionally not implemented — never faked — until that runtime exists.
export class LocalSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "local-whisper";
  isConfigured(): boolean {
    return false;
  }
  configurationMessage(): string | null {
    return "AI_MODE=local requires a locally installed Whisper-compatible runtime, which is not yet configured on this server.";
  }
  async transcribe(): Promise<TranscriptResult> {
    throw new TranscriptionNotConfiguredError(this.configurationMessage()!);
  }
}

let providerInstance: SpeechToTextProvider | null = null;

export function getSpeechToTextProvider(): SpeechToTextProvider {
  if (!providerInstance) {
    if (env.aiMode === "local") {
      providerInstance = new LocalSpeechToTextProvider();
    } else {
      // Provider selection is driven entirely by TRANSCRIPTION_PROVIDER so a
      // different backend can be introduced here without touching callers.
      switch (env.transcription.provider) {
        case "openai":
          providerInstance = new OpenAIWhisperProvider();
          break;
        case "groq":
        default:
          providerInstance = new GroqSpeechToTextProvider();
      }
    }
  }
  return providerInstance;
}
