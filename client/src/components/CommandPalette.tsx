import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as RadixDialog from "@radix-ui/react-dialog";
import { FilePlus2, FileText, LayoutDashboard, Search, Settings, Users, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Action {
  id: string;
  label: string;
  icon: typeof FilePlus2;
  run: () => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  const actions: Action[] = useMemo(
    () => [
      { id: "dashboard", label: "Open dashboard", icon: LayoutDashboard, run: () => navigate("/") },
      { id: "new-note", label: "New clinical note", icon: FilePlus2, run: () => navigate("/notes/new") },
      { id: "notes", label: "Search clinical notes", icon: FileText, run: () => navigate("/notes") },
      { id: "patients", label: "Search patients", icon: Users, run: () => navigate("/patients") },
      { id: "templates", label: "Open templates", icon: ClipboardList, run: () => navigate("/templates") },
      { id: "settings", label: "Open settings", icon: Settings, run: () => navigate("/settings") },
    ],
    [navigate]
  );

  const filtered = actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
        <RadixDialog.Content className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-surface shadow-card focus:outline-none">
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or jump to…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No matching actions.</p>}
            {filtered.map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  action.run();
                  onOpenChange(false);
                  setQuery("");
                }}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-background")}
              >
                <action.icon className="h-4 w-4 text-muted" />
                {action.label}
              </button>
            ))}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
