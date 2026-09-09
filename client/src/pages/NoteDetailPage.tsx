import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Printer,
  Download,
  Copy,
  History,
  CheckCircle2,
  Archive,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SoapSectionCard } from "@/components/SoapSectionCard";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ClinicalNote, NoteVersion } from "@/types";
import { SectionType } from "@/lib/soapFields";
import { formatDateTime } from "@/lib/utils";

const SECTION_ORDER: SectionType[] = ["SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"];
type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

export function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", id],
    queryFn: async () => (await api.get<ClinicalNote>(`/clinical-notes/${id}`)).data,
    enabled: Boolean(id),
  });

  const [sections, setSections] = useState<Record<SectionType, Record<string, unknown>> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [regenerating, setRegenerating] = useState<Partial<Record<SectionType, boolean>>>({});
  const [showTranscript, setShowTranscript] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"finalize" | "archive" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (note && !sections) {
      const initial: Record<string, Record<string, unknown>> = {};
      for (const s of note.sections) initial[s.type] = s.content;
      setSections(initial as Record<SectionType, Record<string, unknown>>);
    }
  }, [note, sections]);

  const readOnly = note ? note.status === "FINALIZED" || note.status === "ARCHIVED" : true;

  const persistSections = async (next: Record<SectionType, Record<string, unknown>>) => {
    if (!id) return;
    setSaveState("saving");
    try {
      await api.patch(`/clinical-notes/${id}`, {
        sections: SECTION_ORDER.map((type) => ({ type, content: next[type] })),
        changeSummary: "Clinician edit",
      });
      setSaveState("saved");
      dirtyRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["note", id] });
    } catch {
      setSaveState(navigator.onLine ? "error" : "offline");
    }
  };

  const scheduleSave = (next: Record<SectionType, Record<string, unknown>>) => {
    dirtyRef.current = true;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistSections(next), 1200);
  };

  const handleFieldChange = (type: SectionType, key: string, value: string | string[]) => {
    if (!sections) return;
    const next = { ...sections, [type]: { ...sections[type], [key]: value } };
    setSections(next);
    scheduleSave(next);
  };

  const saveNow = () => {
    if (sections) {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      persistSections(sections);
    }
  };

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && note && !readOnly) {
        e.preventDefault();
        setConfirmAction("finalize");
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, note, readOnly]);

  const regenerateSection = async (type: SectionType) => {
    if (!id) return;
    setRegenerating((r) => ({ ...r, [type]: true }));
    try {
      const res = await api.post<{ content: Record<string, unknown>; confidence: string; flags: unknown }>(`/clinical-notes/${id}/regenerate-section`, {
        section: type,
      });
      setSections((prev) => (prev ? { ...prev, [type]: res.data.content } : prev));
      queryClient.invalidateQueries({ queryKey: ["note", id] });
      notify({ title: `${type.charAt(0)}${type.slice(1).toLowerCase()} regenerated`, variant: "success" });
    } catch (err) {
      notify({ title: "Regeneration failed", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setRegenerating((r) => ({ ...r, [type]: false }));
    }
  };

  const copySection = async (type: SectionType) => {
    if (!sections) return;
    const text = Object.entries(sections[type])
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    notify({ title: "Section copied to clipboard", variant: "success" });
  };

  const copyFullNote = async () => {
    if (!sections || !note) return;
    const text = SECTION_ORDER.map((type) => {
      const body = Object.entries(sections[type])
        .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\n");
      return `${type}\n${body}`;
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
    notify({ title: "Note copied to clipboard", variant: "success" });
  };

  const runFinalize = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.post(`/clinical-notes/${id}/finalize`);
      queryClient.invalidateQueries({ queryKey: ["note", id] });
      notify({ title: "Note finalized", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to finalize", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const runArchive = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.post(`/clinical-notes/${id}/archive`);
      queryClient.invalidateQueries({ queryKey: ["note", id] });
      notify({ title: "Note archived", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to archive", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const { data: versions } = useQuery({
    queryKey: ["note-versions", id],
    queryFn: async () => (await api.get<NoteVersion[]>(`/clinical-notes/${id}/versions`)).data,
    enabled: historyOpen && Boolean(id),
  });

  const saveLabel = useMemo(() => {
    switch (saveState) {
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "error":
        return "Unable to save";
      case "offline":
        return "Offline — changes kept locally";
      default:
        return "";
    }
  }, [saveState]);

  if (isLoading || !note || !sections) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowTranscript((v) => !v)} title="Toggle transcript panel">
            {showTranscript ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-foreground">{note.patient.fullName ?? note.patient.identifier}</h1>
              <StatusBadge status={note.status} />
            </div>
            <p className="text-xs text-muted">
              {new Date(note.encounter.visitDate).toLocaleString()} · v{note.currentVersion} ·{" "}
              <span className={saveState === "error" ? "text-danger" : saveState === "saving" ? "text-muted" : "text-success"}>{saveLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" /> History
          </Button>
          <Button variant="ghost" size="sm" onClick={copyFullNote}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/clinical-notes/${id}/export?format=pdf`, "_blank")}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={() => setConfirmAction("finalize")}>
              <CheckCircle2 className="h-4 w-4" /> Finalize
            </Button>
          )}
          {note.status === "FINALIZED" && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmAction("archive")}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="no-print flex items-center gap-2 border-b border-border bg-accent/10 px-6 py-2 text-xs text-primary">
          <ShieldAlert className="h-3.5 w-3.5" /> This note is {note.status.toLowerCase()} and is read-only.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showTranscript && (
          <div className="no-print hidden w-[36%] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface p-5 md:flex">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-primary" /> Transcript
            </h2>
            <p className="mb-3 text-xs text-muted">AI-generated transcription — review before clinical use.</p>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-secondary">
              {note.transcript?.text || "No transcript available for this note."}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 print:p-0">
          <div id="print-note" className="mx-auto max-w-3xl space-y-4">
            <div className="hidden print:block">
              <h1 className="text-xl font-semibold">Clinical Note</h1>
              <p className="text-sm">
                {note.patient.fullName ?? note.patient.identifier} (ID: {note.patient.identifier}) · {note.encounter.encounterType.replace(/_/g, " ")} ·{" "}
                {new Date(note.encounter.visitDate).toLocaleDateString()}
              </p>
              <p className="text-sm">
                Clinician: {note.clinician.fullName} ({note.clinician.role}) · Status: {note.status} · Version {note.currentVersion}
              </p>
              <hr className="my-3" />
            </div>

            {SECTION_ORDER.map((type) => (
              <SoapSectionCard
                key={type}
                type={type}
                content={sections[type]}
                confidence={note.sections.find((s) => s.type === type)?.confidence ?? "MISSING_INFORMATION"}
                flags={note.sections.find((s) => s.type === type)?.flags ?? null}
                isEdited={note.sections.find((s) => s.type === type)?.isEdited ?? false}
                readOnly={readOnly}
                regenerating={Boolean(regenerating[type])}
                onChangeField={(key, value) => handleFieldChange(type, key, value)}
                onRegenerate={() => regenerateSection(type)}
                onCopy={() => copySection(type)}
              />
            ))}

            <p className="mt-6 rounded-md border border-border bg-background p-3 text-xs text-muted print:border-0 print:bg-transparent">
              ClinicalNote assists with documentation. It does not replace professional clinical judgment. Clinicians must review all generated content
              before it becomes part of the medical record.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={confirmAction === "finalize"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent title="Finalize this note?" description="Once finalized, the note becomes read-only. Further changes will require a new version.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button loading={actionLoading} onClick={runFinalize}>
              Finalize note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAction === "archive"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent title="Archive this note?" description="Archived notes remain accessible but are removed from active workflows.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={actionLoading} onClick={runArchive}>
              Archive note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent title="Version history" description="Every saved change is preserved as a version.">
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {!versions || versions.length === 0 ? (
              <p className="text-sm text-muted">No versions recorded yet.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Version {v.versionNumber}</span>
                    <span className="text-xs text-muted">{formatDateTime(v.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {v.changeSummary} — {v.author?.fullName ?? "System"}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
