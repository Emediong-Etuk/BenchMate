import type { ReactNode } from "react";

const tones = {
  warn: "border-warn/50 bg-warn/10 text-text",
  bad: "border-bad/50 bg-bad/10 text-text",
  info: "border-border bg-surface-2 text-text",
} as const;

export function Banner({ tone = "info", title, children, action }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-sm text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
