import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  FilePlus2,
  FileText,
  Users,
  ClipboardList,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Stethoscope,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/notes/new", label: "New Clinical Note", icon: FilePlus2 },
  { to: "/notes", label: "Clinical Notes", icon: FileText },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/templates", label: "Templates", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function crumbFor(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/notes/new")) return "New Clinical Note";
  if (pathname.startsWith("/notes/")) return "Clinical Note";
  if (pathname.startsWith("/notes")) return "Clinical Notes";
  if (pathname.startsWith("/patients/")) return "Patient";
  if (pathname.startsWith("/patients")) return "Patients";
  if (pathname.startsWith("/templates")) return "Templates";
  if (pathname.startsWith("/settings")) return "Settings";
  return "";
}

export function AppShell() {
  const { user, organization, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "no-print z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform md:static md:translate-x-0",
          mobileOpen ? "fixed inset-y-0 left-0 translate-x-0" : "fixed -translate-x-full md:flex"
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">ClinicalNote</span>
          <button className="ml-auto text-muted md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-secondary hover:bg-background hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/40 text-xs font-semibold text-primary">
              {user?.fullName?.slice(0, 1).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user?.fullName}</p>
              <p className="truncate text-xs text-muted">{organization?.name ?? "—"}</p>
            </div>
            <button onClick={() => logout()} aria-label="Log out" title="Log out" className="text-muted hover:text-danger">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-foreground/30 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button className="text-muted md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <span>ClinicalNote</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{crumbFor(location.pathname)}</span>
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted hover:text-foreground sm:flex"
          >
            Search or jump to…
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
