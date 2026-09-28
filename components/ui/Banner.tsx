import type { ReactNode } from "react";

const tones = {
  warn: { box: "border-warn/30 bg-warn/[0.07]", dot: "bg-warn" },
  bad: { box: "border-bad/30 bg-bad/[0.07]", dot: "bg-bad" },
  info: { box: "border-border bg-surface", dot: "bg-accent" },
} as const;

export function Banner({ tone = "info", title, children, action }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = tones[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 ${t.box}`}>
      <span className={`h-2.5 w-2.5 shrink-0 self-start rounded-full ${t.dot} mt-2`} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-text">{title}</p>}
        {children && <div className="text-[15px] text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
