import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FilePlus2, FileText, Clock, CheckCircle2, PenLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { ClinicalNoteListItem } from "@/types";
import { useAuth } from "@/providers/AuthProvider";

interface DashboardData {
  metrics: { totalNotes: number; awaitingReview: number; finalized: number; drafts: number };
  recentNotes: ClinicalNoteListItem[];
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardData>("/dashboard")).data,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Welcome back, {user?.fullName?.split(" ")[0]}</h1>
          <p className="text-sm text-muted">Here's what's happening with your clinical documentation.</p>
        </div>
        <Button onClick={() => (window.location.href = "/notes/new")}>
          <FilePlus2 className="h-4 w-4" />
          Create Clinical Note
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon={FileText} label="Clinical notes created" value={data?.metrics.totalNotes} loading={isLoading} />
        <MetricCard icon={Clock} label="Awaiting review" value={data?.metrics.awaitingReview} loading={isLoading} />
        <MetricCard icon={CheckCircle2} label="Finalized" value={data?.metrics.finalized} loading={isLoading} />
        <MetricCard icon={PenLine} label="Drafts" value={data?.metrics.drafts} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent notes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 text-sm text-muted">Loading…</div>
          ) : !data || data.recentNotes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <FileText className="h-8 w-8 text-accent" />
              <p className="text-sm text-muted">No clinical notes yet.</p>
              <Button size="sm" onClick={() => (window.location.href = "/notes/new")}>
                Create your first note
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Patient</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Note type</th>
                    <th className="px-5 py-3 font-medium">Last updated</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentNotes.map((note) => (
                    <tr key={note.id} className="border-b border-border last:border-0 hover:bg-background">
                      <td className="px-5 py-3 font-medium text-foreground">{note.patient.fullName ?? note.patient.identifier}</td>
                      <td className="px-5 py-3 text-secondary">{new Date(note.encounter.visitDate).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={note.status} />
                      </td>
                      <td className="px-5 py-3 text-secondary">{note.noteType}</td>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, loading }: { icon: typeof FileText; label: string; value?: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/25 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-foreground">{loading ? "—" : value ?? 0}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
