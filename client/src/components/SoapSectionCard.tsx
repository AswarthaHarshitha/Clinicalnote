import { RefreshCw, AlertTriangle, Info, ShieldCheck, Copy } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SECTION_FIELDS, SECTION_LABELS, SectionType, formatFieldValue, parseFieldValue } from "@/lib/soapFields";
import { SafetyFlag } from "@/types";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLE: Record<string, { label: string; variant: "success" | "review" | "danger" }> = {
  HIGH: { label: "High confidence", variant: "success" },
  REVIEW_RECOMMENDED: { label: "Review recommended", variant: "review" },
  MISSING_INFORMATION: { label: "Missing information", variant: "danger" },
};

interface Props {
  type: SectionType;
  content: Record<string, unknown>;
  confidence: string;
  flags: SafetyFlag[] | null;
  isEdited: boolean;
  readOnly: boolean;
  regenerating: boolean;
  onChangeField: (key: string, value: string | string[]) => void;
  onRegenerate: () => void;
  onCopy: () => void;
}

export function SoapSectionCard({ type, content, confidence, flags, isEdited, readOnly, regenerating, onChangeField, onRegenerate, onCopy }: Props) {
  const confidenceStyle = CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE.MISSING_INFORMATION;

  return (
    <Card className="print:break-inside-avoid print:shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-primary">{SECTION_LABELS[type]}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={confidenceStyle.variant}>{confidenceStyle.label}</Badge>
            {isEdited && <Badge variant="neutral">Clinician-edited</Badge>}
          </div>
        </div>
        <div className="no-print flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" title="Copy section" onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <Button variant="ghost" size="icon" title={`Regenerate ${type.toLowerCase()}`} onClick={onRegenerate} disabled={regenerating}>
              <RefreshCw className={cn("h-4 w-4", regenerating && "animate-spin")} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags && flags.length > 0 && (
          <div className="space-y-1.5">
            {flags.map((flag, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                  flag.severity === "warning" ? "border-warning/30 bg-warning/5 text-warning" : "border-border bg-background text-muted"
                )}
              >
                {flag.severity === "warning" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {flag.message}
              </div>
            ))}
          </div>
        )}

        {SECTION_FIELDS[type].map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${type}-${field.key}`}>
              {field.label}
              {field.kind === "list" && <span className="ml-1 font-normal text-muted">(one per line)</span>}
            </Label>
            {readOnly ? (
              <p className="whitespace-pre-line rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                {formatFieldValue(field.kind, content[field.key]) || "Not documented"}
              </p>
            ) : (
              <Textarea
                id={`${type}-${field.key}`}
                rows={field.kind === "list" ? 3 : 2}
                value={formatFieldValue(field.kind, content[field.key])}
                onChange={(e) => onChangeField(field.key, parseFieldValue(field.kind, e.target.value))}
              />
            )}
          </div>
        ))}

        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <ShieldCheck className="h-3 w-3" /> AI-generated draft — clinician review required.
        </p>
      </CardContent>
    </Card>
  );
}
