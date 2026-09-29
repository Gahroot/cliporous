/** Offline image-based lighting. Environment affects reflections, NEVER the alpha background. */
import { useThree } from '@react-three/fiber';
import type React from 'react';
import { useLayoutEffect } from 'react';
import { InstancedMesh, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const StudioEnvironment: React.FC = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const target = (() => {
      try {
        // 128px is ample for rough clay, and is generated once per mounted canvas.
        return generator.fromScene(room, 0.04, 0.1, 100, { size: 128 });
      } finally {
        room.traverse((object) => {
          if (object instanceof InstancedMesh) object.dispose();
        });
        room.dispose();
        generator.dispose();
      }
    })();
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
    };
  }, [gl, scene]);
  return null;
};
