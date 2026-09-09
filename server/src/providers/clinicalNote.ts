import OpenAI from "openai";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { env } from "../config/env";
import {
  soapJsonSchema,
  soapNoteSchema,
  SoapNote,
  SoapSectionKey,
  SOAP_SECTION_SCHEMAS,
  repairSoapNoteShape,
  repairSoapSectionShape,
} from "../schemas/soap";

function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|overloaded|high demand|rate limit)\b/i.test(message);
}

/** Retries a real provider call on transient capacity errors (503/429/
 * "overloaded") with short exponential backoff. Free-tier LLM endpoints see
 * genuine capacity spikes; this absorbs those without ever substituting a
 * fake response — if every attempt fails, the real final error is thrown. */
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

export class LlmNotConfiguredError extends Error {
  constructor(message = "LLM provider is not configured.") {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmGenerationFailedError extends Error {
  constructor(cause: unknown) {
    super(`SOAP generation failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "LlmGenerationFailedError";
  }
}

export class LlmOutputInvalidError extends Error {
  constructor(public readonly issues: unknown) {
    super("The model's structured output failed schema validation, even after a structural repair attempt.");
    this.name = "LlmOutputInvalidError";
  }
}

const SYSTEM_PROMPT = `You are a clinical documentation extraction assistant. Your role is to transform clinician-provided encounter information into a structured SOAP note. Do not diagnose independently. Do not invent or infer undocumented clinical facts. Preserve the meaning of the clinician's source material. If information is missing, explicitly mark it as not documented (use an empty string "" for missing free-text fields and an empty array [] for missing lists — never omit a field). Separate patient-reported information (Subjective) from clinician-observed objective findings actually stated in the source (Objective), and keep documented assessment and documented plan strictly to what the clinician stated. Do not create medications, dosages, laboratory values, vital signs, diagnoses, allergies, or treatment plans that are absent from the source material. If the clinician states a tentative or "likely" impression, preserve it as stated rather than converting it into a confirmed diagnosis. Only extract information that is explicitly present in the transcript; never fabricate values to fill a field. Return ONLY JSON matching the required schema — no commentary.`;

function buildUserPrompt(transcript: string, chiefComplaint?: string | null): string {
  return [
    chiefComplaint ? `Documented chief complaint: ${chiefComplaint}` : null,
    "Clinician-reviewed visit transcript:",
    "---",
    transcript,
    "---",
    "Extract a SOAP note strictly from the transcript above, following the system instructions. Return only the fields defined by the schema.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSectionUserPrompt(section: SoapSectionKey, transcript: string, chiefComplaint?: string | null): string {
  return [
    chiefComplaint ? `Documented chief complaint: ${chiefComplaint}` : null,
    "Clinician-reviewed visit transcript:",
    "---",
    transcript,
    "---",
    `Regenerate ONLY the ${section} section of the SOAP note strictly from the transcript above, following the system instructions. Return only the fields defined by the schema for this section.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Parses raw model JSON, and if it fails schema validation, attempts one
 * structural repair pass (filling entirely-missing keys with their
 * schema-correct empty value — never inventing content) before validating
 * again. Never silently accepts invalid data. */
function validateSoapWithRepair(rawText: string): SoapNote {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new LlmOutputInvalidError([{ message: `Model did not return valid JSON: ${err instanceof Error ? err.message : String(err)}` }]);
  }
  const firstPass = soapNoteSchema.safeParse(parsed);
  if (firstPass.success) return firstPass.data;

  const repaired = soapNoteSchema.safeParse(repairSoapNoteShape(parsed));
  if (repaired.success) return repaired.data;

  throw new LlmOutputInvalidError(repaired.error.issues);
}

function validateSectionWithRepair(section: SoapSectionKey, rawSectionValue: unknown) {
  const schema = SOAP_SECTION_SCHEMAS[section];
  const firstPass = schema.safeParse(rawSectionValue);
  if (firstPass.success) return firstPass.data;

  const repaired = schema.safeParse(repairSoapSectionShape(section, rawSectionValue));
  if (repaired.success) return repaired.data;

  throw new LlmOutputInvalidError(repaired.error.issues);
}

export interface ClinicalNoteProvider {
  readonly name: string;
  isConfigured(): boolean;
  configurationMessage(): string | null;
  generateSoapNote(transcript: string, chiefComplaint?: string | null): Promise<SoapNote>;
  regenerateSection(section: SoapSectionKey, transcript: string, chiefComplaint?: string | null): Promise<SoapNote[Lowercase<SoapSectionKey>]>;
}

// ---------- Gemini (primary — free tier) ----------

const GEMINI_STRING: Schema = { type: SchemaType.STRING };
const GEMINI_STRING_ARRAY: Schema = { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } };

const GEMINI_SECTION_SCHEMAS: Record<SoapSectionKey, Schema> = {
  SUBJECTIVE: {
    type: SchemaType.OBJECT,
    properties: {
      chiefComplaint: GEMINI_STRING,
      historyOfPresentIllness: GEMINI_STRING,
      symptoms: GEMINI_STRING_ARRAY,
      patientReportedHistory: GEMINI_STRING,
      relevantHistory: GEMINI_STRING,
    },
    required: ["chiefComplaint", "historyOfPresentIllness", "symptoms", "patientReportedHistory", "relevantHistory"],
  },
  OBJECTIVE: {
    type: SchemaType.OBJECT,
    properties: {
      vitalSigns: GEMINI_STRING_ARRAY,
      physicalExam: GEMINI_STRING_ARRAY,
      observations: GEMINI_STRING_ARRAY,
      labResults: GEMINI_STRING_ARRAY,
      imagingResults: GEMINI_STRING_ARRAY,
    },
    required: ["vitalSigns", "physicalExam", "observations", "labResults", "imagingResults"],
  },
  ASSESSMENT: {
    type: SchemaType.OBJECT,
    properties: {
      summary: GEMINI_STRING,
      clinicalImpressions: GEMINI_STRING_ARRAY,
      differentialConsiderations: GEMINI_STRING_ARRAY,
    },
    required: ["summary", "clinicalImpressions", "differentialConsiderations"],
  },
  PLAN: {
    type: SchemaType.OBJECT,
    properties: {
      medications: GEMINI_STRING_ARRAY,
      investigations: GEMINI_STRING_ARRAY,
      treatments: GEMINI_STRING_ARRAY,
      followUp: GEMINI_STRING,
      patientInstructions: GEMINI_STRING,
      referrals: GEMINI_STRING_ARRAY,
    },
    required: ["medications", "investigations", "treatments", "followUp", "patientInstructions", "referrals"],
  },
};

const GEMINI_SOAP_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    subjective: GEMINI_SECTION_SCHEMAS.SUBJECTIVE,
    objective: GEMINI_SECTION_SCHEMAS.OBJECTIVE,
    assessment: GEMINI_SECTION_SCHEMAS.ASSESSMENT,
    plan: GEMINI_SECTION_SCHEMAS.PLAN,
  },
  required: ["subjective", "objective", "assessment", "plan"],
};

export class GeminiClinicalNoteProvider implements ClinicalNoteProvider {
  readonly name = "gemini-structured";
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) this.client = new GoogleGenerativeAI(env.gemini.apiKey);
    return this.client;
  }

  isConfigured(): boolean {
    return env.gemini.apiKey.length > 0;
  }

  configurationMessage(): string | null {
    return this.isConfigured() ? null : "Gemini is not configured. Set GEMINI_API_KEY (free tier available at aistudio.google.com/apikey).";
  }

  async generateSoapNote(transcript: string, chiefComplaint?: string | null): Promise<SoapNote> {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    try {
      const model = this.getClient().getGenerativeModel({
        model: env.gemini.model,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: GEMINI_SOAP_SCHEMA },
      });
      const result = await withRetry(() => model.generateContent(buildUserPrompt(transcript, chiefComplaint)));
      return validateSoapWithRepair(result.response.text());
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }

  async regenerateSection(section: SoapSectionKey, transcript: string, chiefComplaint?: string | null) {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    try {
      const model = this.getClient().getGenerativeModel({
        model: env.gemini.model,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: GEMINI_SECTION_SCHEMAS[section] },
      });
      const result = await withRetry(() => model.generateContent(buildSectionUserPrompt(section, transcript, chiefComplaint)));
      return validateSectionWithRepair(section, JSON.parse(result.response.text())) as any;
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }
}

// ---------- Groq (alternate free-tier LLM, OpenAI-compatible) ----------

export class GroqClinicalNoteProvider implements ClinicalNoteProvider {
  readonly name = "groq-structured";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) this.client = new OpenAI({ apiKey: env.groq.apiKey, baseURL: "https://api.groq.com/openai/v1" });
    return this.client;
  }

  isConfigured(): boolean {
    return env.groq.apiKey.length > 0;
  }

  configurationMessage(): string | null {
    return this.isConfigured() ? null : "Groq is not configured. Set GROQ_API_KEY (free tier available at console.groq.com).";
  }

  async generateSoapNote(transcript: string, chiefComplaint?: string | null): Promise<SoapNote> {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    try {
      const client = this.getClient();
      const completion = await withRetry(() =>
        client.chat.completions.create({
          model: env.groq.llmModel,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT}\n\nRespond with a single JSON object matching this shape exactly:\n${JSON.stringify(soapJsonSchema)}` },
            { role: "user", content: buildUserPrompt(transcript, chiefComplaint) },
          ],
        })
      );
      return validateSoapWithRepair(completion.choices[0]?.message?.content ?? "{}");
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }

  async regenerateSection(section: SoapSectionKey, transcript: string, chiefComplaint?: string | null) {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    const propertyName = section.toLowerCase();
    try {
      const client = this.getClient();
      const wrapperSchema = { type: "object", properties: { [propertyName]: (soapJsonSchema.properties as any)[propertyName] }, required: [propertyName] };
      const completion = await withRetry(() =>
        client.chat.completions.create({
          model: env.groq.llmModel,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT}\n\nRespond with a single JSON object matching this shape exactly:\n${JSON.stringify(wrapperSchema)}` },
            { role: "user", content: buildSectionUserPrompt(section, transcript, chiefComplaint) },
          ],
        })
      );
      const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      return validateSectionWithRepair(section, raw[propertyName]) as any;
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }
}

// ---------- OpenAI (optional — not a mandatory dependency) ----------

export class OpenAIClinicalNoteProvider implements ClinicalNoteProvider {
  readonly name = "openai-structured";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) this.client = new OpenAI({ apiKey: env.openai.apiKey });
    return this.client;
  }

  isConfigured(): boolean {
    return env.openai.apiKey.length > 0;
  }

  configurationMessage(): string | null {
    return this.isConfigured() ? null : "OpenAI is not configured. Set OPENAI_API_KEY.";
  }

  async generateSoapNote(transcript: string, chiefComplaint?: string | null): Promise<SoapNote> {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    try {
      const client = this.getClient();
      const completion = await withRetry(() =>
        client.chat.completions.create({
          model: env.openai.llmModel,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(transcript, chiefComplaint) },
          ],
          response_format: { type: "json_schema", json_schema: { name: "soap_note", strict: true, schema: soapJsonSchema } },
        })
      );
      return validateSoapWithRepair(completion.choices[0]?.message?.content ?? "{}");
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }

  async regenerateSection(section: SoapSectionKey, transcript: string, chiefComplaint?: string | null) {
    if (!this.isConfigured()) throw new LlmNotConfiguredError(this.configurationMessage()!);
    const propertyName = section.toLowerCase();
    try {
      const client = this.getClient();
      const wrapperSchema = {
        type: "object",
        additionalProperties: false,
        properties: { [propertyName]: (soapJsonSchema.properties as any)[propertyName] },
        required: [propertyName],
      };
      const completion = await withRetry(() =>
        client.chat.completions.create({
          model: env.openai.llmModel,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildSectionUserPrompt(section, transcript, chiefComplaint) },
          ],
          response_format: { type: "json_schema", json_schema: { name: `soap_${propertyName}`, strict: true, schema: wrapperSchema } },
        })
      );
      const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      return validateSectionWithRepair(section, raw[propertyName]) as any;
    } catch (err) {
      if (err instanceof LlmOutputInvalidError) throw err;
      throw new LlmGenerationFailedError(err);
    }
  }
}

// AI_MODE=local is reserved for a future self-hosted Ollama-compatible
// runtime. It is intentionally not implemented — never faked — until that
// runtime exists.
export class LocalClinicalNoteProvider implements ClinicalNoteProvider {
  readonly name = "local-llm";
  isConfigured(): boolean {
    return false;
  }
  configurationMessage(): string | null {
    return "AI_MODE=local requires a locally installed Ollama-compatible model runtime, which is not yet configured on this server.";
  }
  async generateSoapNote(): Promise<SoapNote> {
    throw new LlmNotConfiguredError(this.configurationMessage()!);
  }
  async regenerateSection(): Promise<any> {
    throw new LlmNotConfiguredError(this.configurationMessage()!);
  }
}

let providerInstance: ClinicalNoteProvider | null = null;

export function getClinicalNoteProvider(): ClinicalNoteProvider {
  if (!providerInstance) {
    if (env.aiMode === "local") {
      providerInstance = new LocalClinicalNoteProvider();
    } else {
      switch (env.llm.provider) {
        case "openai":
          providerInstance = new OpenAIClinicalNoteProvider();
          break;
        case "groq":
          providerInstance = new GroqClinicalNoteProvider();
          break;
        case "gemini":
        default:
          providerInstance = new GeminiClinicalNoteProvider();
      }
    }
  }
  return providerInstance;
}
