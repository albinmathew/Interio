/**
 * Design mode. Baseline: orbit around the furnished plan.
 * The 3D viewer workstream adds placement, finishes and proper lighting.
 */
import { getEntry } from '@interio/catalog';
import { selectLevelMesh, useLevel } from '@interio/core';
import { PlanScene, SceneLighting } from '@interio/scene3d';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

export default function Viewer3D() {
  const level = useLevel();
  if (!level) return null;
  const { min, max } = selectLevelMesh(level).bounds;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const span = Math.max(max[0] - min[0], max[2] - min[2], 4);
  return (
    <Canvas shadows camera={{ position: [cx + span * 0.5, span * 0.9, cz + span * 0.9], fov: 40, near: 0.1, far: 500 }}>
      <color attach="background" args={['#f4f2ee']} />
      <SceneLighting level={level} mode="dollhouse" />
      <PlanScene level={level} resolveEntry={getEntry} />
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={span * 4} />
    </Canvas>
  );
}
