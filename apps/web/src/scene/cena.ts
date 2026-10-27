import type { CameraControlsImpl } from "@react-three/drei";

/** Acesso à câmera de fora do Canvas (minimapa). O CameraRig preenche ao montar. */
export const cena: { controles: CameraControlsImpl | null } = { controles: null };
