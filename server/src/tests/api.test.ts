import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../config/prisma";

const run = Date.now();
const clinicianEmail = `clinician.${run}@clinicalnote.test`;
const otherOrgEmail = `other.${run}@clinicalnote.test`;
const password = "Password123";

beforeAll(async () => {
  // Isolated test database — truncate in FK-safe order so each run starts clean.
  await prisma.auditLog.deleteMany();
  await prisma.clinicalNoteVersion.deleteMany();
  await prisma.soapSection.deleteMany();
  await prisma.clinicalNote.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.audioRecording.deleteMany();
  await prisma.encounter.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.template.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function extractCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const sidCookie = cookies.find((c: string) => c.startsWith("clinicalnote_sid"));
  if (!sidCookie) throw new Error("Session cookie was not set");
  return sidCookie.split(";")[0];
}

describe("Authentication", () => {
  it("registers a new account, creating a real organization and membership", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Dr. Test Clinician",
      email: clinicianEmail,
      password,
      confirmPassword: password,
      role: "Physician",
      organizationName: "Test Clinic",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(clinicianEmail.toLowerCase());

    const user = await prisma.user.findUnique({ where: { email: clinicianEmail.toLowerCase() }, include: { memberships: true } });
    expect(user).not.toBeNull();
    expect(user!.memberships).toHaveLength(1);
    expect(user!.memberships[0].role).toBe("OWNER");
  });

  it("rejects registration with a duplicate email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Duplicate",
      email: clinicianEmail,
      password,
      confirmPassword: password,
      role: "Physician",
      organizationName: "Another Clinic",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("rejects login with an incorrect password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in with correct credentials and issues a session cookie", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects /auth/me without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user and organization with a valid session", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password });
    const cookie = extractCookie(login);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(clinicianEmail.toLowerCase());
    expect(res.body.data.organization.name).toBe("Test Clinic");
  });

  it("revokes the session on logout", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password });
    const cookie = extractCookie(login);
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });
});

describe("Patients, encounters, and multi-tenant authorization", () => {
  let cookie: string;
  let otherCookie: string;
  let patientId: string;

  beforeAll(async () => {
    const login = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password });
    cookie = extractCookie(login);

    const registerOther = await request(app).post("/api/auth/register").send({
      fullName: "Dr. Other",
      email: otherOrgEmail,
      password,
      confirmPassword: password,
      role: "Physician",
      organizationName: "Other Clinic",
    });
    otherCookie = extractCookie(registerOther);
  });

  it("creates a patient scoped to the clinician's organization", async () => {
    const res = await request(app).post("/api/patients").set("Cookie", cookie).send({ identifier: `MRN-${run}`, fullName: "Test Patient" });
    expect(res.status).toBe(201);
    patientId = res.body.data.id;
  });

  it("rejects a duplicate patient identifier within the same organization", async () => {
    const res = await request(app).post("/api/patients").set("Cookie", cookie).send({ identifier: `MRN-${run}`, fullName: "Duplicate" });
    expect(res.status).toBe(409);
  });

  it("prevents a user from another organization from reading the patient", async () => {
    const res = await request(app).get(`/api/patients/${patientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(404);
  });

  it("creates an encounter for the patient", async () => {
    const res = await request(app)
      .post("/api/encounters")
      .set("Cookie", cookie)
      .send({ patientId, encounterType: "INITIAL_CONSULTATION", visitDate: new Date().toISOString(), chiefComplaint: "Sore throat" });
    expect(res.status).toBe(201);
    expect(res.body.data.patientId).toBe(patientId);
  });

  it("rejects unauthenticated access to protected routes", async () => {
    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(401);
  });
});

describe("AI configuration honesty (no fake data)", () => {
  let cookie: string;

  beforeAll(async () => {
    const login = await request(app).post("/api/auth/login").send({ email: clinicianEmail, password });
    cookie = extractCookie(login);
  });

  it("reports the speech-to-text and LLM providers as not configured when no API key is set", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.speechToText).toBe("not_configured");
    expect(res.body.data.llm).toBe("not_configured");
  });

  it("refuses to transcribe audio when no speech-to-text provider is configured, rather than fabricating a transcript", async () => {
    const patient = await request(app).post("/api/patients").set("Cookie", cookie).send({ identifier: `MRN-audio-${run}` });
    const encounter = await request(app)
      .post("/api/encounters")
      .set("Cookie", cookie)
      .send({ patientId: patient.body.data.id, encounterType: "INITIAL_CONSULTATION", visitDate: new Date().toISOString() });

    const upload = await request(app)
      .post("/api/audio/upload")
      .set("Cookie", cookie)
      .field("encounterId", encounter.body.data.id)
      .field("sourceType", "UPLOADED")
      .attach("audio", Buffer.from("not-real-audio-bytes"), { filename: "visit.webm", contentType: "audio/webm" });
    expect(upload.status).toBe(201);

    const transcribe = await request(app).post("/api/transcriptions").set("Cookie", cookie).send({ audioRecordingId: upload.body.data.id });
    expect(transcribe.status).toBe(503);
    expect(transcribe.body.error.code).toBe("TRANSCRIPTION_NOT_CONFIGURED");
  });

  it("rejects an unsupported audio MIME type on upload", async () => {
    const patient = await request(app).post("/api/patients").set("Cookie", cookie).send({ identifier: `MRN-badmime-${run}` });
    const encounter = await request(app)
      .post("/api/encounters")
      .set("Cookie", cookie)
      .send({ patientId: patient.body.data.id, encounterType: "INITIAL_CONSULTATION", visitDate: new Date().toISOString() });

    const upload = await request(app)
      .post("/api/audio/upload")
      .set("Cookie", cookie)
      .field("encounterId", encounter.body.data.id)
      .field("sourceType", "UPLOADED")
      .attach("audio", Buffer.from("not-a-real-pdf"), { filename: "notaudio.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(400);
  });
});
