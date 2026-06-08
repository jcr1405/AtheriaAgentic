import { Line, OrbitControls, Stars } from "@react-three/drei";
import { AGENTS, AGENT_ORDER, PIPELINE_EDGES, type AgentId } from "@/lib/agents";
import type { ActivePacket } from "@/lib/useOrchestration";
import type { AgentRuntime } from "@/lib/useOrchestration";
import { AgentNode } from "./AgentNode";
import { DataPacket } from "./DataPacket";

interface ConstellationProps {
  agents: Record<AgentId, AgentRuntime>;
  activePacket: ActivePacket | null;
  onPacketArrive: () => void;
}

export function Constellation({ agents, activePacket, onPacketArrive }: ConstellationProps) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <Stars radius={80} depth={50} count={4000} factor={4} saturation={0} fade speed={1} />

      {/* pipeline connection lines */}
      {PIPELINE_EDGES.map(([a, b]) => (
        <Line
          key={`${a}-${b}`}
          points={[AGENTS[a].position, AGENTS[b].position]}
          color={AGENTS[a].color}
          lineWidth={1.2}
          transparent
          opacity={0.32}
          dashed
          dashSize={0.25}
          gapSize={0.15}
        />
      ))}

      {AGENT_ORDER.map((id, i) => (
        <AgentNode key={id} config={AGENTS[id]} status={agents[id].status} seed={i * 1.7} />
      ))}

      {activePacket && (
        <DataPacket
          key={activePacket.id}
          from={AGENTS[activePacket.from].position}
          to={AGENTS[activePacket.to].position}
          color={activePacket.color}
          onArrive={onPacketArrive}
        />
      )}

      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={12}
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}
