import { AGENTS, AGENT_ORDER, type AgentStatus } from "@/lib/agents";
import type { AgentRuntime } from "@/lib/useOrchestration";

const STATUS_STYLES: Record<AgentStatus, string> = {
  Idle: "text-muted-foreground border-muted-foreground/30 bg-muted-foreground/5",
  Thinking: "text-warning border-warning/40 bg-warning/10 animate-flash",
  Transferring: "text-cyan border-cyan/40 bg-cyan/10 animate-flash",
  Compiling: "text-pink border-pink/40 bg-pink/10 animate-flash",
};

function AgentCard({
  id,
  runtime,
  totalVramGb,
}: {
  id: keyof typeof AGENTS;
  runtime: AgentRuntime;
  totalVramGb: number;
}) {
  const cfg = AGENTS[id];
  const vramPct = Math.min(100, (runtime.vramGb / totalVramGb) * 100);

  return (
    <div className="glass-panel rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }}
          />
          <span
            className="font-display text-[11px] font-bold uppercase tracking-wider"
            style={{ color: cfg.color }}
          >
            {cfg.shortCode}
          </span>
        </div>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_STYLES[runtime.status]}`}
        >
          {runtime.status}
        </span>
      </div>

      <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={runtime.task}>
        » {runtime.task}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2 font-mono text-[10px]">
        <div>
          <div className="text-muted-foreground/60">TOK/SEC</div>
          <div className="text-foreground">{runtime.tokensPerSec}</div>
        </div>
        <div>
          <div className="text-muted-foreground/60">VRAM</div>
          <div className="text-foreground">
            {runtime.vramGb.toFixed(1)}
            <span className="text-muted-foreground/50">/{totalVramGb.toFixed(1)}GB</span>
          </div>
        </div>
      </div>

      {/* Real-time VRAM bar */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${vramPct}%`,
            backgroundColor: cfg.color,
            boxShadow: `0 0 8px ${cfg.color}`,
          }}
        />
      </div>
    </div>
  );
}

export function AgentStatusPanel({
  agents,
  totalVramGb,
}: {
  agents: Record<string, AgentRuntime>;
  totalVramGb: number;
}) {
  return (
    <aside className="pointer-events-auto absolute left-4 top-24 z-20 flex w-64 flex-col gap-2.5">
      <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
        // Agent Status
      </h2>
      {AGENT_ORDER.map((id) => (
        <AgentCard key={id} id={id} runtime={agents[id]} totalVramGb={totalVramGb} />
      ))}
    </aside>
  );
}
