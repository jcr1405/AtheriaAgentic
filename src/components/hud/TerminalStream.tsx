import { useEffect, useRef } from "react";
import type { LogLevel, LogLine } from "@/lib/useOrchestration";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info:    "text-muted-foreground",
  agent:   "text-cyan",
  success: "text-success",
  warn:    "text-warning",
  error:   "text-destructive",
  loop:    "text-orange-400",   // evaluator feedback-loop retries
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info:    "",
  agent:   "",
  success: "",
  warn:    "⚠ ",
  error:   "✖ ",
  loop:    "⟳ ",
};

export function TerminalStream({ logs }: { logs: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  return (
    <aside className="pointer-events-auto absolute right-4 top-24 z-20 flex w-72 flex-col">
      <h2 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
        // Live Telemetry Stream
      </h2>
      <div className="glass-panel relative h-[58vh] overflow-hidden rounded-lg">
        {/* terminal title bar */}
        <div className="flex items-center gap-1.5 border-b border-panel-border px-3 py-2">
          <span className="size-2 rounded-full bg-destructive/80" />
          <span className="size-2 rounded-full bg-warning/80" />
          <span className="size-2 rounded-full bg-success/80" />
          <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            aetheria@mesh ~ tail -f
          </span>
        </div>

        <div className="thin-scroll h-[calc(58vh-37px)] space-y-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed">
          {logs.map((l) => (
            <div
              key={l.id}
              className={`flex gap-1.5 ${l.level === "loop" ? "rounded px-1 py-0.5" : ""}`}
              style={
                l.level === "loop"
                  ? { background: "rgba(251,146,60,0.06)", borderLeft: "2px solid rgba(251,146,60,0.4)" }
                  : undefined
              }
            >
              <span className="shrink-0 text-muted-foreground/40">{l.ts}</span>
              <span className={LEVEL_COLOR[l.level]}>
                <span className="opacity-70">[{l.source}]</span>{" "}
                {LEVEL_PREFIX[l.level]}{l.text}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </aside>
  );
}
