import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AgentConfig, AgentStatus } from "@/lib/agents";

interface AgentNodeProps {
  config: AgentConfig;
  status: AgentStatus;
  seed: number;
}

export function AgentNode({ config, status, seed }: AgentNodeProps) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  const active = status !== "Idle";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      // continuous sine-wave idle float
      group.current.position.y = config.position[1] + Math.sin(t * 0.9 + seed) * 0.18;
      group.current.position.x = config.position[0] + Math.cos(t * 0.6 + seed) * 0.08;
    }
    if (core.current) {
      core.current.rotation.y += 0.004;
      core.current.rotation.x += 0.002;
      const pulse = active ? 1 + Math.sin(t * 6) * 0.08 : 1;
      core.current.scale.setScalar(pulse);
    }
    if (shell.current) {
      shell.current.rotation.y -= 0.012;
      shell.current.rotation.z += 0.006;
    }
    if (halo.current) {
      const hp = active ? 1.6 + Math.sin(t * 4) * 0.25 : 1.45;
      halo.current.scale.setScalar(hp);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = active ? 0.22 + Math.sin(t * 4) * 0.08 : 0.1;
    }
  });

  return (
    <group ref={group} position={config.position}>
      <pointLight color={config.color} intensity={active ? 3 : 1.2} distance={6} />

      {/* glowing core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial
          color={config.color}
          emissive={config.color}
          emissiveIntensity={active ? 2.4 : 1.1}
          roughness={0.25}
          metalness={0.6}
        />
      </mesh>

      {/* rotating wireframe shell */}
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.66, 0]} />
        <meshBasicMaterial color={config.color} wireframe transparent opacity={0.35} />
      </mesh>

      {/* soft halo */}
      <mesh ref={halo}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshBasicMaterial color={config.color} transparent opacity={0.12} depthWrite={false} />
      </mesh>

      <Html center distanceFactor={9} position={[0, -1.0, 0]} pointerEvents="none">
        <div className="pointer-events-none select-none whitespace-nowrap text-center">
          <div
            className="font-display text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: config.color, textShadow: `0 0 10px ${config.color}` }}
          >
            {config.shortCode}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-white/55">
            {status}
          </div>
        </div>
      </Html>
    </group>
  );
}
