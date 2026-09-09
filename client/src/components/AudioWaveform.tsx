import { cn } from "@/lib/utils";

// Renders the live frequency levels captured from the microphone's
// AnalyserNode — every bar reflects the actual input signal, not a canned
// animation.
export function AudioWaveform({ levels, active, className }: { levels: number[]; active: boolean; className?: string }) {
  return (
    <div className={cn("flex h-16 items-end justify-center gap-[3px]", className)} aria-hidden="true">
      {levels.map((level, i) => (
        <div
          key={i}
          className={cn("w-1 rounded-full transition-[height]", active ? "bg-primary" : "bg-accent/60")}
          style={{ height: `${Math.max(4, level * 60)}px` }}
        />
      ))}
    </div>
  );
}
