import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, FileText, FilePlus2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { ClinicalNoteListItem, NoteStatus } from "@/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const STATUS_OPTIONS: Array<{ value: NoteStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "TRANSCRIBED", label: "Transcribed" },
  { value: "AI_GENERATED", label: "AI generated" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "FINALIZED", label: "Finalized" },
  { value: "ARCHIVED", label: "Archived" },
];

export function NotesListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<NoteStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, isLoading } = useQuery({
    queryKey: ["notes", debouncedSearch, status, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", status });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await api.get<ClinicalNoteListItem[]>(`/clinical-notes?${params.toString()}`);
      return res;
    },
  });

  const notes = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clinical Notes</h1>
          <p className="text-sm text-muted">Search, filter, and manage documentation across your organization.</p>
        </div>
        <Link to="/notes/new">
          <Button>
            <FilePlus2 className="h-4 w-4" /> New Clinical Note
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search by patient or note type…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as NoteStatus | "ALL");
            setPage(1);
          }}
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-subtle"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <FileText className="h-8 w-8 text-accent" />
              <p className="text-sm text-muted">{search || status !== "ALL" ? "No notes match your filters." : "You haven't created any clinical notes yet."}</p>
              {!search && status === "ALL" && (
                <Link to="/notes/new">
                  <Button size="sm">Create your first note</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="px-5 py-3 font-medium">Patient</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Encounter</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Clinician</th>
                      <th className="px-5 py-3 font-medium">Updated</th>
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note) => (
                      <tr key={note.id} className="border-b border-border last:border-0 hover:bg-background">
                        <td className="px-5 py-3 font-medium text-foreground">{note.patient.fullName ?? note.patient.identifier}</td>
                        <td className="px-5 py-3 text-secondary">{new Date(note.encounter.visitDate).toLocaleDateString()}</td>
                        <td className="px-5 py-3 text-secondary">{note.encounter.encounterType.replace(/_/g, " ")}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={note.status} />
                        </td>
                        <td className="px-5 py-3 text-secondary">{note.clinician.fullName}</td>
                        <td className="px-5 py-3 text-secondary">{formatDateTime(note.updatedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <Link to={`/notes/${note.id}`} className="text-sm font-medium text-primary hover:underline">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
                <span>
                  Page {page} of {totalPages} · {total} note{total === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
