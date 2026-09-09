import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-center">
      <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted">The page you're looking for doesn't exist.</p>
      <Link to="/">
        <Button size="sm">Return to dashboard</Button>
      </Link>
    </div>
  );
}
