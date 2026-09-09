import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Star, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Template } from "@/types";

const CATEGORIES = ["General consultation", "Follow-up", "Chronic care", "Telehealth", "Preventive visit"];

export function TemplatesPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [guidance, setGuidance] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await api.get<Template[]>("/templates")).data,
  });

  const resetForm = () => {
    setName("");
    setCategory(CATEGORIES[0]);
    setDescription("");
    setGuidance({ subjective: "", objective: "", assessment: "", plan: "" });
  };

  const createTemplate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("/templates", { name, category, description: description || null, structure: guidance });
      notify({ title: "Template created", variant: "success" });
      setCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    } catch (err) {
      notify({ title: "Unable to create template", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    await api.patch(`/templates/${id}`, { isDefault: true });
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    await api.del(`/templates/${id}`);
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Templates</h1>
          <p className="text-sm text-muted">Reusable SOAP guidance for common encounter types.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ClipboardList className="h-8 w-8 text-accent" />
            <p className="text-sm text-muted">No templates yet.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted">{t.category}</p>
                  </div>
                  {t.isDefault && <Badge variant="success">Default</Badge>}
                </div>
                {t.description && <p className="mt-2 text-sm text-secondary">{t.description}</p>}
                <div className="mt-3 flex gap-2">
                  {!t.isDefault && (
                    <Button variant="ghost" size="sm" onClick={() => setDefault(t.id)}>
                      <Star className="h-3.5 w-3.5" /> Set default
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Create template" description="Guidance notes help structure future SOAP notes — this is never patient data.">
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label className="capitalize">{key} guidance</Label>
                <Textarea rows={2} value={guidance[key]} onChange={(e) => setGuidance((g) => ({ ...g, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={createTemplate} disabled={!name.trim()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
