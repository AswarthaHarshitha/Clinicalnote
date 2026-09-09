import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import {
  Mic,
  Pause,
  Play,
  Square,
  RotateCcw,
  Upload,
  Trash2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudioWaveform } from "@/components/AudioWaveform";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/utils";
import { Patient, Encounter, Transcript } from "@/types";

const SUPPORTED_MIME_TYPES = ["audio/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg"];
const MAX_UPLOAD_MB = 25;

const visitSchema = z.object({
  identifier: z.string().min(1, "Patient identifier is required."),
  fullName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  visitDate: z.string().min(1, "Visit date is required."),
  encounterType: z.enum(["INITIAL_CONSULTATION", "FOLLOW_UP", "TELEHEALTH", "PREVENTIVE_VISIT", "CHRONIC_CARE", "URGENT", "OTHER"]),
  chiefComplaint: z.string().optional(),
  location: z.string().optional(),
});
type VisitFormValues = z.infer<typeof visitSchema>;

const STEPS = ["Patient & Visit", "Audio", "Transcript", "Generate"] as const;

export function NewNotePage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [step, setStep] = useState(0);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [audioRecordingId, setAudioRecordingId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");

  const [savingVisit, setSavingVisit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<"RECORDED" | "UPLOADED" | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VisitFormValues>({
    resolver: zodResolver(visitSchema),
    defaultValues: { visitDate: new Date().toISOString().slice(0, 16), encounterType: "INITIAL_CONSULTATION" },
  });

  const onSubmitVisit = async (values: VisitFormValues) => {
    setStageError(null);
    setSavingVisit(true);
    try {
      let resolvedPatient: Patient;
      const existing = await api.get<Patient[]>(`/patients?search=${encodeURIComponent(values.identifier)}`);
      const exactMatch = existing.data.find((p) => p.identifier.toLowerCase() === values.identifier.toLowerCase());
      if (exactMatch) {
        resolvedPatient = exactMatch;
      } else {
        const created = await api.post<Patient>("/patients", {
          identifier: values.identifier,
          fullName: values.fullName || null,
          dateOfBirth: values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : null,
        });
        resolvedPatient = created.data;
      }
      setPatient(resolvedPatient);

      const createdEncounter = await api.post<Encounter>("/encounters", {
        patientId: resolvedPatient.id,
        encounterType: values.encounterType,
        visitDate: new Date(values.visitDate).toISOString(),
        chiefComplaint: values.chiefComplaint || null,
        location: values.location || null,
      });
      setEncounter(createdEncounter.data);
      setStep(1);
    } catch (err) {
      setStageError(err instanceof ApiRequestError ? err.message : "Unable to save visit information.");
    } finally {
      setSavingVisit(false);
    }
  };

  const uploadAudio = async (blob: Blob, sourceType: "RECORDED" | "UPLOADED", mimeType: string) => {
    if (!encounter) return;
    if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setStageError(`Audio exceeds the ${MAX_UPLOAD_MB}MB limit.`);
      return;
    }
    setStageError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("audio", blob, `recording.${mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : "wav"}`);
      formData.append("encounterId", encounter.id);
      formData.append("sourceType", sourceType);
      const res = await api.post<{ id: string }>("/audio/upload", formData);
      setAudioRecordingId(res.data.id);
      setAudioSourceType(sourceType);
    } catch (err) {
      setStageError(err instanceof ApiRequestError ? err.message : "Unable to upload the audio.");
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = (file: File) => {
    if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
      setStageError(`Unsupported audio format: ${file.type || "unknown"}.`);
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setStageError(`File exceeds the ${MAX_UPLOAD_MB}MB limit.`);
      return;
    }
    setUploadedFile(file);
    void uploadAudio(file, "UPLOADED", file.type);
  };

  const runTranscription = async () => {
    if (!audioRecordingId) return;
    setStageError(null);
    setTranscribing(true);
    try {
      const res = await api.post<Transcript>("/transcriptions", { audioRecordingId });
      setTranscript(res.data);
      setTranscriptDraft(res.data.text);
      setStep(2);
    } catch (err) {
      setStageError(err instanceof ApiRequestError ? err.message : "Unable to transcribe the recording.");
    } finally {
      setTranscribing(false);
    }
  };

  const saveTranscriptEdits = async () => {
    if (!transcript) return;
    try {
      const res = await api.patch<Transcript>(`/transcriptions/${transcript.id}`, { text: transcriptDraft });
      setTranscript(res.data);
      notify({ title: "Transcript updated", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to save transcript", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    }
  };

  const generateSoap = async () => {
    if (!transcript || !encounter) return;
    setStageError(null);
    setGenerating(true);
    try {
      if (transcriptDraft !== transcript.text) {
        await api.patch(`/transcriptions/${transcript.id}`, { text: transcriptDraft });
      }
      const res = await api.post<{ id: string }>("/clinical-notes/generate", { transcriptId: transcript.id, encounterId: encounter.id });
      notify({ title: "SOAP note generated", description: "Clinician review required before finalizing.", variant: "success" });
      navigate(`/notes/${res.data.id}`);
    } catch (err) {
      setStageError(err instanceof ApiRequestError ? err.message : "Unable to generate the SOAP note.");
    } finally {
      setGenerating(false);
    }
  };

  const wordCount = transcriptDraft.trim() ? transcriptDraft.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">New Clinical Note</h1>
      <p className="mt-1 text-sm text-muted">Record or upload the visit, review the transcript, then generate a structured SOAP note.</p>

      <ol className="my-6 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-medium ${
                i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-success/20 text-success" : "bg-accent/20 text-muted"
              }`}
            >
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={i === step ? "font-medium text-foreground" : "text-muted"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      {stageError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {stageError}
        </div>
      )}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Patient & visit information</CardTitle>
            <CardDescription>
              Only the fields below are stored for this encounter. Patient identifiers are used to look up or create the patient record within your
              organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitVisit)} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Patient identifier</Label>
                <Input id="identifier" placeholder="MRN or clinic ID" {...register("identifier")} />
                {errors.identifier && <p className="text-xs text-danger">{errors.identifier.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Patient name (optional)</Label>
                <Input id="fullName" {...register("fullName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of birth (optional)</Label>
                <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitDate">Visit date</Label>
                <Input id="visitDate" type="datetime-local" {...register("visitDate")} />
                {errors.visitDate && <p className="text-xs text-danger">{errors.visitDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="encounterType">Encounter type</Label>
                <select id="encounterType" className="flex h-9 w-full rounded-md border border-border bg-surface px-3 text-sm shadow-subtle" {...register("encounterType")}>
                  <option value="INITIAL_CONSULTATION">Initial consultation</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="TELEHEALTH">Telehealth</option>
                  <option value="PREVENTIVE_VISIT">Preventive visit</option>
                  <option value="CHRONIC_CARE">Chronic care</option>
                  <option value="URGENT">Urgent</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location (optional)</Label>
                <Input id="location" {...register("location")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="chiefComplaint">Chief complaint (optional)</Label>
                <Textarea id="chiefComplaint" rows={2} {...register("chiefComplaint")} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={savingVisit}>
                  Continue to audio
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Record or upload the visit</CardTitle>
            <CardDescription>
              Patient: {patient?.fullName ?? patient?.identifier ?? "—"}. Audio is processed for transcription only{`; `}see Settings for your
              organization's retention policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border border-border bg-background p-5 text-center">
              <p className="mb-3 text-sm font-medium text-foreground">
                {recorder.state === "idle" && "Ready to record"}
                {recorder.state === "requesting" && "Requesting microphone access…"}
                {recorder.state === "recording" && "Recording visit…"}
                {recorder.state === "paused" && "Recording paused"}
                {recorder.state === "stopped" && "Recording captured"}
                {recorder.state === "error" && "Unable to access the microphone"}
              </p>
              <AudioWaveform levels={recorder.levels} active={recorder.state === "recording"} />
              <p className="mt-2 font-mono text-2xl text-foreground">{formatDuration(recorder.elapsedMs / 1000)}</p>
              {recorder.error && <p className="mt-1 text-xs text-danger">{recorder.error}</p>}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {recorder.state === "idle" && (
                  <Button onClick={recorder.start}>
                    <Mic className="h-4 w-4" /> Start recording
                  </Button>
                )}
                {recorder.state === "recording" && (
                  <>
                    <Button variant="secondary" onClick={recorder.pause}>
                      <Pause className="h-4 w-4" /> Pause
                    </Button>
                    <Button variant="danger" onClick={recorder.stop}>
                      <Square className="h-4 w-4" /> Stop
                    </Button>
                  </>
                )}
                {recorder.state === "paused" && (
                  <>
                    <Button onClick={recorder.resume}>
                      <Play className="h-4 w-4" /> Resume
                    </Button>
                    <Button variant="danger" onClick={recorder.stop}>
                      <Square className="h-4 w-4" /> Stop
                    </Button>
                  </>
                )}
                {(recorder.state === "stopped" || recorder.state === "error") && (
                  <Button variant="secondary" onClick={recorder.reset}>
                    <RotateCcw className="h-4 w-4" /> Restart
                  </Button>
                )}
              </div>

              {recorder.state === "stopped" && recorder.audioBlob && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <audio controls src={URL.createObjectURL(recorder.audioBlob)} className="w-full max-w-sm" />
                  {audioRecordingId && audioSourceType === "RECORDED" ? (
                    <p className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Recording uploaded
                    </p>
                  ) : (
                    <Button size="sm" loading={uploading} onClick={() => recorder.audioBlob && uploadAudio(recorder.audioBlob, "RECORDED", recorder.audioBlob.type)}>
                      <Upload className="h-4 w-4" /> Use this recording
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-muted">or upload a file</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="rounded-md border border-dashed border-border p-5 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_MIME_TYPES.join(",")}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
              />
              {!uploadedFile ? (
                <>
                  <Upload className="mx-auto mb-2 h-6 w-6 text-muted" />
                  <p className="text-sm text-muted">WAV, MP3, M4A, OGG or WEBM — up to {MAX_UPLOAD_MB}MB</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                    Choose audio file
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted">{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  {uploading ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                    </p>
                  ) : audioRecordingId && audioSourceType === "UPLOADED" ? (
                    <p className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                    </p>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadedFile(null);
                      setAudioRecordingId(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={runTranscription} disabled={!audioRecordingId} loading={transcribing}>
                {transcribing ? "Transcribing…" : "Transcribe audio"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && transcript && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Review transcript
            </CardTitle>
            <CardDescription>AI-generated transcription — review and correct before clinical use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea rows={14} value={transcriptDraft} onChange={(e) => setTranscriptDraft(e.target.value)} className="font-mono text-sm" />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {wordCount} words · Provider: {transcript.provider}
                {transcript.durationSec ? ` · ${formatDuration(transcript.durationSec)}` : ""}
              </span>
              <Button variant="link" size="sm" onClick={saveTranscriptEdits} disabled={transcriptDraft === transcript.text}>
                Save edits
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!transcriptDraft.trim()}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Generate SOAP note
            </CardTitle>
            <CardDescription>
              The reviewed transcript will be sent to the configured clinical AI to produce a structured SOAP draft. You will review and finalize it next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-background p-4 text-sm text-secondary">
              <p className="font-medium text-foreground">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>The transcript is sent to the LLM provider to extract Subjective, Objective, Assessment and Plan.</li>
                <li>Deterministic safety checks flag missing information or contradictions.</li>
                <li>You review, edit, and finalize the note — nothing is added to the medical record automatically.</li>
              </ol>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={generateSoap} loading={generating}>
                {generating ? "Structuring SOAP…" : "Generate SOAP note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
