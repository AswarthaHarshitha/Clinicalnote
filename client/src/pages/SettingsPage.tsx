import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Shield, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/providers/AuthProvider";
import { formatDateTime } from "@/lib/utils";

interface HealthStatus {
  database: string;
  speechToText: string;
  llm: string;
}
interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export function SettingsPage() {
  const { user, organization, role, refetch, logout } = useAuth();
  const { notify } = useToast();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [profRole, setProfRole] = useState(user?.role ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [orgName, setOrgName] = useState(organization?.name ?? "");
  const [requirePatientName, setRequirePatientName] = useState(organization?.requirePatientName ?? true);
  const [requireDob, setRequireDob] = useState(organization?.requireDob ?? false);
  const [storeAudio, setStoreAudio] = useState(organization?.storeAudio ?? false);
  const [savingOrg, setSavingOrg] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? "");
    setProfRole(user?.role ?? "");
  }, [user]);
  useEffect(() => {
    setOrgName(organization?.name ?? "");
    setRequirePatientName(organization?.requirePatientName ?? true);
    setRequireDob(organization?.requireDob ?? false);
    setStoreAudio(organization?.storeAudio ?? false);
  }, [organization]);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get<HealthStatus>("/health")).data,
  });
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await api.get<SessionRow[]>("/settings/sessions")).data,
  });

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch("/settings/profile", { fullName, role: profRole });
      await refetch();
      notify({ title: "Profile updated", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to update profile", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveOrg = async () => {
    setSavingOrg(true);
    try {
      await api.patch("/settings/organization", { name: orgName, requirePatientName, requireDob, storeAudio });
      await refetch();
      notify({ title: "Organization settings updated", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to update organization", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setSavingOrg(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setChangingPassword(true);
    try {
      await api.post("/settings/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      notify({ title: "Password changed", variant: "success" });
    } catch (err) {
      notify({ title: "Unable to change password", description: err instanceof ApiRequestError ? err.message : undefined, variant: "error" });
    } finally {
      setChangingPassword(false);
    }
  };

  const revokeAllSessions = async () => {
    if (!confirm("Log out of all sessions, including this one?")) return;
    await api.post("/settings/sessions/revoke-all");
    await logout();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={profRole} onChange={(e) => setProfRole(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <Button size="sm" loading={savingProfile} onClick={saveProfile}>
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your role: {role}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Clinic / organization name</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={role !== "OWNER" && role !== "ADMIN"} />
          </div>
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={requirePatientName} onChange={(e) => setRequirePatientName(e.target.checked)} disabled={role !== "OWNER" && role !== "ADMIN"} />
            Require patient name on new notes
          </label>
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={requireDob} onChange={(e) => setRequireDob(e.target.checked)} disabled={role !== "OWNER" && role !== "ADMIN"} />
            Require date of birth on new notes
          </label>
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={storeAudio} onChange={(e) => setStoreAudio(e.target.checked)} disabled={role !== "OWNER" && role !== "ADMIN"} />
            Retain raw audio after transcription (STORE_AUDIO)
          </label>
          {(role === "OWNER" || role === "ADMIN") && (
            <Button size="sm" loading={savingOrg} onClick={saveOrg}>
              Save organization settings
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI service status</CardTitle>
          <CardDescription>
            Audio is sent to the configured speech-to-text provider for transcription; the reviewed transcript is sent to the configured LLM provider to
            structure the SOAP note. No other patient data leaves your organization's database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <StatusRow label="Database" ok={health?.database === "ok"} okLabel="Connected" badLabel="Unavailable" />
          <StatusRow label="Speech-to-text provider" ok={health?.speechToText === "configured"} okLabel="Configured" badLabel="Not configured" />
          <StatusRow label="Clinical note LLM provider" ok={health?.llm === "configured"} okLabel="Configured" badLabel="Not configured" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          </div>
          <Button size="sm" loading={changingPassword} onClick={changePassword} disabled={!currentPassword || !newPassword}>
            Change password
          </Button>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Active sessions</p>
            <div className="space-y-2">
              {sessions?.map((s) => (
                <div key={s.id} className="rounded-md border border-border px-3 py-2 text-xs text-secondary">
                  <p className="truncate">{s.userAgent ?? "Unknown device"}</p>
                  <p className="text-muted">
                    Started {formatDateTime(s.createdAt)} · Expires {formatDateTime(s.expiresAt)}
                  </p>
                </div>
              ))}
            </div>
            <Button variant="danger" size="sm" className="mt-3" onClick={revokeAllSessions}>
              <LogOut className="h-4 w-4" /> Log out all sessions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, ok, okLabel, badLabel }: { label: string; ok?: boolean; okLabel: string; badLabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-danger"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {ok ? okLabel : badLabel}
      </span>
    </div>
  );
}
