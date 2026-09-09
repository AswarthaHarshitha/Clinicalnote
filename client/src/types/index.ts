export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  requirePatientName?: boolean;
  requireDob?: boolean;
  defaultLanguage?: string;
  dateFormat?: string;
  storeAudio?: boolean;
}

export type NoteStatus = "DRAFT" | "TRANSCRIBED" | "AI_GENERATED" | "IN_REVIEW" | "FINALIZED" | "ARCHIVED";

export type EncounterType =
  | "INITIAL_CONSULTATION"
  | "FOLLOW_UP"
  | "TELEHEALTH"
  | "PREVENTIVE_VISIT"
  | "CHRONIC_CARE"
  | "URGENT"
  | "OTHER";

export interface Patient {
  id: string;
  identifier: string;
  fullName: string | null;
  dateOfBirth: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  clinicianId: string;
  encounterType: EncounterType;
  visitDate: string;
  chiefComplaint: string | null;
  location: string | null;
}

export interface Transcript {
  id: string;
  text: string;
  language: string | null;
  durationSec: number | null;
  provider: string;
  confidence: number | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
  editedByUser: boolean;
}

export interface SafetyFlag {
  severity: "warning" | "info";
  code: string;
  message: string;
}

export interface SoapSection {
  id: string;
  type: "SUBJECTIVE" | "OBJECTIVE" | "ASSESSMENT" | "PLAN";
  content: Record<string, unknown>;
  confidence: "HIGH" | "REVIEW_RECOMMENDED" | "MISSING_INFORMATION";
  flags: SafetyFlag[] | null;
  isEdited: boolean;
  generatedAt: string | null;
}

export interface ClinicalNote {
  id: string;
  status: NoteStatus;
  noteType: string;
  currentVersion: number;
  finalizedAt: string | null;
  archivedAt: string | null;
  lastSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
  encounter: Encounter;
  clinician: { id: string; fullName: string; role: string };
  transcript: Transcript | null;
  sections: SoapSection[];
}

export interface ClinicalNoteListItem {
  id: string;
  status: NoteStatus;
  noteType: string;
  updatedAt: string;
  patient: { identifier: string; fullName: string | null };
  encounter: { encounterType: EncounterType; visitDate: string };
  clinician: { fullName: string };
}

export interface NoteVersion {
  id: string;
  versionNumber: number;
  changeSummary: string;
  createdAt: string;
  author: { fullName: string } | null;
  snapshot: { status: string; soap: Record<string, Record<string, unknown>> };
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string | null;
  isDefault: boolean;
  structure: Record<string, unknown>;
}
