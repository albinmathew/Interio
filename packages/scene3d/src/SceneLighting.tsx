import { planToWorld, selectRooms, type Level } from '@interio/core';

export interface SceneLightingProps {
  level: Level;
  /**
   * `dollhouse`: sun from above with shadows, for the open-top 3D view.
   * `interior`: lit from inside each room, for walking under ceilings.
   */
  mode: 'dollhouse' | 'interior';
}

/** Baseline lighting for both camera modes. */
export function SceneLighting({ level, mode }: SceneLightingProps) {
  if (mode === 'dollhouse')
    return (
      <>
        <hemisphereLight args={['#ffffff', '#b8b2a7', 0.9]} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-bias={-0.0004}
        />
      </>
    );
  const y = (level.ceilingHeight - 250) / 1000;
  return (
    <>
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#ffffff', '#cfc8bb', 0.6]} />
      {selectRooms(level).map((room, i) => {
        const [x, , z] = planToWorld(room.centroid);
        const reach = Math.max(room.width, room.depth) / 1000;
        return <pointLight key={room.roomId ?? i} position={[x, y, z]} intensity={reach * 2.2} distance={reach * 1.6 + 2} decay={1.4} color="#fff4e0" />;
      })}
    </>
  );
}
