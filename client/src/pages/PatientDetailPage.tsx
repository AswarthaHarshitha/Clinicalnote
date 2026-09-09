import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";

interface PatientDetail {
  id: string;
  identifier: string;
  fullName: string | null;
  dateOfBirth: string | null;
  encounters: Array<{ id: string; visitDate: string; encounterType: string; chiefComplaint: string | null }>;
  notes: Array<{ id: string; status: string; noteType: string; updatedAt: string }>;
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => (await api.get<PatientDetail>(`/patients/${id}`)).data,
    enabled: Boolean(id),
  });

  if (isLoading || !data) return <div className="p-8 text-sm text-muted">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">{data.fullName ?? data.identifier}</h1>
      <p className="text-sm text-muted">
        ID: {data.identifier}
        {data.dateOfBirth ? ` · DOB: ${formatDate(data.dateOfBirth)}` : ""}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Encounter timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.encounters.length === 0 ? (
              <p className="text-sm text-muted">No encounters recorded.</p>
            ) : (
              data.encounters.map((e) => (
                <div key={e.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">{e.encounterType.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted">{new Date(e.visitDate).toLocaleString()}</p>
                  {e.chiefComplaint && <p className="mt-1 text-secondary">{e.chiefComplaint}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clinical notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.notes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <FileText className="h-6 w-6 text-accent" />
                <p className="text-sm text-muted">No clinical notes for this patient yet.</p>
              </div>
            ) : (
              data.notes.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`} className="block rounded-md border border-border p-3 text-sm hover:bg-background">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{n.noteType}</span>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">Updated {formatDateTime(n.updatedAt)}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
