import { useEffect, useState } from "react";
import { useOrchestration } from "@/lib/useOrchestration";
import { SceneCanvas } from "@/components/scene/SceneCanvas";
import { TopBanner } from "@/components/hud/TopBanner";
import { AgentStatusPanel } from "@/components/hud/AgentStatusPanel";
import { TerminalStream } from "@/components/hud/TerminalStream";
import { ControlPanel } from "@/components/hud/ControlPanel";
import { ArtifactPanel } from "@/components/ArtifactPanel";

export function Dashboard() {
  const {
    agents,
    logs,
    activePacket,
    isRunning,
    trigger,
    stop,
    handlePacketArrive,
    artifactVisible,
    artifactFilename,
    artifactFiles,
    confidenceScore,
    loopCount,
    projectActive,
    totalVramGb,
    closeArtifact,
  } = useOrchestration();

  // Controlled input state — owned here so we can clear it instantly on trigger
  const [inputValue, setInputValue] = useState("");

  // R3F Canvas is client-only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0a0a16]">
      {/* 3D constellation layer */}
      <div className="absolute inset-0 z-0">
        {mounted ? (
          <SceneCanvas agents={agents} activePacket={activePacket} onPacketArrive={handlePacketArrive} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Initializing mesh renderer...
          </div>
        )}
      </div>

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,#0a0a16_100%)]" />

      {/* HUD */}
      <TopBanner />
      <AgentStatusPanel agents={agents} totalVramGb={totalVramGb} />
      <TerminalStream logs={logs} />

      {/* Eval loop badge */}
      {isRunning && loopCount > 1 && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2">
          <div
            className="glass-panel flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{ border: "1px solid rgba(251,146,60,0.4)" }}
          >
            <span className="size-1.5 animate-pulse rounded-full bg-orange-400" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange-400">
              Eval loop {loopCount} — reworking
            </span>
          </div>
        </div>
      )}

      {/* Project continuation hint — visible when idle and project is active */}
      {projectActive && !isRunning && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div
            className="glass-panel flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{ border: "1px solid rgba(76,201,240,0.3)" }}
          >
            <span className="size-1.5 animate-pulse rounded-full bg-cyan-400" />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(76,201,240,0.8)" }}>
              Project active — type to continue building
            </span>
          </div>
        </div>
      )}

      <ControlPanel
        isRunning={isRunning}
        value={inputValue}
        onChange={setInputValue}
        onTrigger={trigger}
        onStop={stop}
        projectActive={projectActive}
      />

      <ArtifactPanel
        isVisible={artifactVisible}
        filename={artifactFilename}
        artifactFiles={artifactFiles}
        confidenceScore={confidenceScore}
        projectActive={projectActive}
        isRunning={isRunning}
        onContinue={trigger}
        onClose={closeArtifact}
      />
    </main>
  );
}
