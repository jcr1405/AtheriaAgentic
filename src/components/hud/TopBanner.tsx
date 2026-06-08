import { Activity } from "lucide-react";

export function TopBanner() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-5">
      <div className="glass-panel pointer-events-auto rounded-xl px-6 py-3 text-center">
        <h1 className="font-display text-base font-extrabold uppercase tracking-[0.35em] text-foreground text-glow sm:text-xl">
          AETHERIA <span className="text-cyan">//</span> AGENTIC MESH INTERFACE
        </h1>
        <div className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]">
          <Activity className="size-3 text-success animate-flash" />
          <span className="text-success animate-flash">System Status: Operational</span>
        </div>
      </div>
    </header>
  );
}
