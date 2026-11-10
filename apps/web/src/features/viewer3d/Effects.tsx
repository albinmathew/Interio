/**
 * Soft contact shadows for the Design view: everything close to the floor darkens it a
 * little, which grounds furniture and shades the foot of the walls like ambient
 * occlusion would. It costs one extra low-resolution pass, so it is the first thing to
 * go when frames get slow and it never runs on software renderers.
 */
import { ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Box } from './camera';
import { useViewer } from './state';

/** Layer for selection outlines, handles and other helpers: drawn by the main camera, ignored by the contact-shadow pass. */
export const HELPER_LAYER = 1;

/** True for CPU rasterisers (SwiftShader, llvmpipe), where an extra pass costs far more than it gives. */
function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/** `?ao=1` forces the pass on and `?ao=0` off, for comparing looks and for screenshots. */
function override(): boolean | null {
  const value = new URLSearchParams(window.location.search).get('ao');
  return value === '1' ? true : value === '0' ? false : null;
}

export function Effects({ box }: { box: Box }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const quality = useViewer((s) => s.quality);
  const forced = useMemo(override, []);
  const capable = useMemo(() => !isSoftwareRenderer(gl.getContext()), [gl]);
  const enabled = forced ?? (capable && quality === 'high');
  useEffect(() => {
    camera.layers.enable(HELPER_LAYER);
  }, [camera]);
  const width = box.max[0] - box.min[0] + 2;
  const depth = box.max[2] - box.min[2] + 2;
  const lower = () => useViewer.getState().setQuality('low');
  return (
    <>
      {forced === null && capable && <PerformanceMonitor flipflops={2} onDecline={lower} onFallback={lower} />}
      {enabled && (
        <ContactShadows
          position={[(box.min[0] + box.max[0]) / 2, 0.006, (box.min[2] + box.max[2]) / 2]}
          scale={[width, depth]}
          resolution={1024}
          far={0.9}
          blur={1.1}
          opacity={0.55}
          color="#2a2622"
        />
      )}
    </>
  );
}
