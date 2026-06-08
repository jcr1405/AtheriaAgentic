import { Canvas } from "@react-three/fiber";
import type { AgentId } from "@/lib/agents";
import type { ActivePacket, AgentRuntime } from "@/lib/useOrchestration";
import { Constellation } from "./Constellation";

interface SceneCanvasProps {
  agents: Record<AgentId, AgentRuntime>;
  activePacket: ActivePacket | null;
  onPacketArrive: () => void;
}

export function SceneCanvas({ agents, activePacket, onPacketArrive }: SceneCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#0a0a16"]} />
      <fog attach="fog" args={["#0a0a16", 12, 26]} />
      <Constellation
        agents={agents}
        activePacket={activePacket}
        onPacketArrive={onPacketArrive}
      />
    </Canvas>
  );
}
