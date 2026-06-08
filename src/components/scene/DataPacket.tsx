import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface DataPacketProps {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  /** travel duration in seconds */
  duration?: number;
  onArrive: () => void;
}

/**
 * A glowing packet that travels along the vector line between two nodes.
 * Animation is fully self-contained via useFrame; it reports completion
 * through `onArrive` so the orchestration engine can advance its state.
 */
export function DataPacket({ from, to, color, duration = 1.1, onArrive }: DataPacketProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Mesh>(null);
  const progress = useRef(0);
  const done = useRef(false);

  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);

  useFrame((_, delta) => {
    if (done.current) return;
    progress.current = Math.min(1, progress.current + delta / duration);
    const p = progress.current;
    // ease-in-out
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

    const pos = start.clone().lerp(end, eased);
    // slight arc lift along travel
    pos.z += Math.sin(eased * Math.PI) * 0.6;

    if (mesh.current) {
      mesh.current.position.copy(pos);
      const s = 1 + Math.sin(p * Math.PI) * 0.6;
      mesh.current.scale.setScalar(s);
    }
    if (trail.current) {
      const trailPos = start.clone().lerp(end, Math.max(0, eased - 0.06));
      trailPos.z += Math.sin(Math.max(0, eased - 0.06) * Math.PI) * 0.6;
      trail.current.position.copy(trailPos);
    }

    if (p >= 1 && !done.current) {
      done.current = true;
      onArrive();
    }
  });

  return (
    <group>
      <mesh ref={mesh}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3}
          toneMapped={false}
        />
        <pointLight color={color} intensity={4} distance={3} />
      </mesh>
      <mesh ref={trail}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}
