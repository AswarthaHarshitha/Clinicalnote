import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, ApiRequestError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Patient } from "@/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useToast } from "@/components/ui/toast";

export function PatientsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [createOpen, setCreateOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [creating, setCreating] = useState(false);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["patients", debouncedSearch],
    queryFn: async () => (await api.get<Patient[]>(`/patients?search=${encodeURIComponent(debouncedSearch)}`)).data,
  });

  const createPatient = async () => {
    if (!identifier.trim()) return;
    setCreating(true);
    try {
      await api.post("/patients", { identifier, fullName: fullName || null, dateOfBirth: dob ? new Date(dob).toISOString() : null });
      notify({ title: "Patient created", variant: "success" });
      setCreateOpen(false);
      setIdentifier("");
      setFullName("");
      setDob("");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err) {
      notify({ title: "Unable to create patient", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Patients</h1>
          <p className="text-sm text-muted">Patient records within your organization.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create patient
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input placeholder="Search patients…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Users className="h-8 w-8 text-accent" />
              <p className="text-sm text-muted">{search ? "No patients match your search." : "No patients have been added."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Identifier</th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Date of birth</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-background">
                      <td className="px-5 py-3 font-medium text-foreground">{p.identifier}</td>
                      <td className="px-5 py-3 text-secondary">{p.fullName ?? "—"}</td>
                      <td className="px-5 py-3 text-secondary">{p.dateOfBirth ? formatDate(p.dateOfBirth) : "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/patients/${p.id}`} className="text-sm font-medium text-primary hover:underline">
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Create patient" description="Only the fields below are stored.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient identifier</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="MRN or clinic ID" />
            </div>
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth (optional)</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button loading={creating} onClick={createPatient} disabled={!identifier.trim()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
