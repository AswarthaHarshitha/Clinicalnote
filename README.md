# ClinicalNote

A voice-to-clinical-note documentation tool for healthcare professionals. A clinician records or uploads a visit, the audio is transcribed by a real
speech-to-text provider, the clinician reviews the transcript, and a real LLM structures it into an editable SOAP note (Subjective / Objective /
Assessment / Plan) — which the clinician edits, versions, and finalizes.

There is no seeded data, no mock providers, and no fabricated AI output anywhere in this codebase. If a provider isn't configured, the app says so —
it never invents a transcript or a SOAP note.

> **Disclaimer.** ClinicalNote assists with documentation. It does not replace professional clinical judgment. Clinicians must review all
> AI-generated content before it becomes part of the medical record. This project is designed with healthcare privacy and security
> considerations in mind, but no compliance claim (HIPAA, GDPR, etc.) is made — that depends on your full deployment and legal review.

## Architecture

```
client/   React + TypeScript + Vite + Tailwind — the clinical workspace
server/   Node + TypeScript + Express + Prisma — API, auth, providers
shared/   (reserved for cross-package types as the app grows)
```

**Auth** — email/password, Argon2id hashing, opaque session tokens (hashed, stored in Postgres) set as an httpOnly cookie. No JWTs to manage,
no external auth provider required.

**Multi-tenancy** — every clinical record belongs to an `Organization`. Access is always resolved server-side as
`user → membership → organization → resource`; the frontend never gets to assert an organization ID.

**AI providers are abstracted, not hardcoded to one vendor:**

```
interface SpeechToTextProvider { transcribe(...): Promise<TranscriptResult> }
interface ClinicalNoteProvider  { generateSoapNote(...), regenerateSection(...) }
```

| Capability | Default | Also available | Env selector |
|---|---|---|---|
| Speech-to-text | **Groq** (`whisper-large-v3-turbo`, free tier) | OpenAI Whisper | `TRANSCRIPTION_PROVIDER=groq\|openai` |
| SOAP structuring | **Gemini** (free tier) | Groq (Llama 3.3, free tier) · OpenAI | `LLM_PROVIDER=gemini\|groq\|openai` |

Nothing is hardcoded to a paid vendor — the app runs on ₹0 mandatory API spend using Groq + Gemini free tiers. `AI_MODE=local` is reserved for a
future self-hosted Whisper/Ollama runtime; until that's implemented, selecting it makes every AI feature report a clear "not configured" state
rather than faking a response.

## Clinical safety design

- The LLM's system prompt explicitly forbids inventing symptoms, diagnoses, medications, dosages, vital signs, labs, or history not present in
  the transcript. Missing information comes back as `""` or `[]` ("not documented"), never fabricated.
- Every structured response is validated with Zod. If a provider returns malformed JSON, a **structural repair** pass fills only entirely-missing
  keys with their schema-correct empty value (never invented content) and re-validates; if it still doesn't validate, the API returns a real
  error — the invalid draft is never saved.
- A deterministic (non-LLM) safety layer flags: missing required fields, no documented diagnosis, no follow-up, and simple transcript
  contradictions (e.g. "denies fever" ... "reports fever").
- Every SOAP section carries a confidence badge (`HIGH` / `REVIEW_RECOMMENDED` / `MISSING_INFORMATION`) computed from those real checks —
  never a fabricated "AI confidence: 97%" number.
- Notes move through `DRAFT → TRANSCRIBED → AI_GENERATED → IN_REVIEW → FINALIZED → ARCHIVED`. Only a clinician can finalize a note. Finalized
  notes are read-only; every edit before that creates a version snapshot, so nothing is silently overwritten.

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form + Zod, React Router, Radix primitives, Lucide icons.
- **Backend:** Node.js, TypeScript, Express, Prisma ORM, Argon2, Multer, PDFKit.
- **Database:** PostgreSQL.
- **AI:** Groq (speech-to-text) + Gemini (structured SOAP generation), both provider-swappable.

## Installation

Prerequisites: Node.js 18+, PostgreSQL running locally (or a free-tier hosted instance, e.g. Supabase).

```bash
# 1. Database
createdb clinicalnote

# 2. Server
cd server
npm install
cp ../.env.example .env   # then fill in real values — see below
npx prisma migrate deploy
npm run dev                # http://localhost:4000

# 3. Client (separate terminal)
cd client
npm install
npm run dev                # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:4000`, so no CORS configuration is needed in development.

## Environment variables

See [`.env.example`](./.env.example) for the full annotated list. Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random 32+ byte secret for session cookies |
| `AI_MODE` | `cloud` (default) or `local` (reserved, not yet implemented) |
| `TRANSCRIPTION_PROVIDER` / `LLM_PROVIDER` | Which implementation each capability resolves to |
| `GROQ_API_KEY` | Free tier: console.groq.com/keys |
| `GEMINI_API_KEY` | Free tier: aistudio.google.com/apikey |
| `OPENAI_API_KEY` | Optional — only needed if you switch a provider to `openai` |
| `STORE_AUDIO` | `false` (default) discards raw audio after transcription; `true` retains it on local disk |

`.env` is git-ignored. Never commit real keys, and never put them in frontend code — the client never sees a provider key; every AI call is
made server-side.

## Database

Prisma models: `Organization`, `User`, `Membership`, `Session`, `Patient`, `Encounter`, `AudioRecording`, `Transcript`, `ClinicalNote`,
`SoapSection`, `ClinicalNoteVersion`, `Template`, `AuditLog`. Run `npx prisma studio` from `server/` to browse data, or
`npx prisma migrate dev --name <description>` to add a new migration during development.

The database starts empty. There is no seed script — the first data you see is whatever you create through the app.

## Running tests

```bash
cd server
createdb clinicalnote_test        # once
npx prisma migrate deploy --schema prisma/schema.prisma   # against clinicalnote_test, via .env.test
npx vitest run
```

Tests cover: registration/login/session auth, patient/encounter/note CRUD and cross-organization authorization, the SOAP Zod schema (including
rejecting hallucinated field shapes), and the deterministic contradiction/confidence safety checks. Provider calls are exercised through their
real "not configured" error path (`.env.test` intentionally leaves all provider keys blank) rather than mocked — per the no-fake-data principle,
this repo does not stub AI responses even in tests.

## Production deployment notes

- Set `COOKIE_SECURE=true` behind HTTPS, and set `CORS_ORIGIN` to your real frontend origin.
- Put the server behind a reverse proxy that terminates TLS; `app.set("trust proxy", 1)` is already set for correct client IPs behind one.
- `express-rate-limit` is applied globally and, more tightly, to `/api/auth/*`.
- If you enable `STORE_AUDIO=true`, point `STORAGE_DIR` at a private, non-web-served volume (or swap in real object storage — the storage path
  is centralized in `routes/audio.ts` / `routes/transcriptions.ts` for that purpose).
- Rotate `SESSION_SECRET` and all provider keys before going live with real patient data, and put this behind your organization's actual
  security, legal, and compliance review — this project does not itself constitute a compliance certification.

## Security considerations already in place

Argon2id password hashing · httpOnly, sameSite cookies · Helmet security headers · rate limiting · Zod validation on every mutating endpoint ·
Prisma parameterized queries (no raw SQL string interpolation) · file upload MIME/size validation · organization-scoped authorization on every
query · audit log of login/logout, patient/note/template/encounter mutations, transcript generation, SOAP generation, exports, and settings
changes · no provider secrets ever sent to the frontend.
