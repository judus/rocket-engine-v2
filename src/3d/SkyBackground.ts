import type { TextureImage } from './TextureImage.js';
import type { PerspectiveCamera, Vec3 } from './PerspectiveCamera.js';

/** Opaque sRGB equirectangular artwork, independent of illumination/reflections.
 * +Z is panorama centre, +Y its top. Positive yaw turns the artwork toward +X.
 */
export interface SkyBackground3D {
  readonly image: TextureImage;
  readonly yaw?: number;
}
export interface SkyBackgroundView {
  readonly image: TextureImage;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}
/** Rotation/FOV only: no position, near/far distance, or world geometry. */
export function skyBackgroundView(
  background: SkyBackground3D,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): SkyBackgroundView {
  const yaw = camera.yaw - (background.yaw ?? 0),
    pitch = camera.pitch;
  if (
    ![yaw, pitch, camera.verticalFov, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    camera.verticalFov <= 0 ||
    camera.verticalFov >= Math.PI
  )
    throw new RangeError('Invalid sky background camera or viewport');
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const ty = Math.tan(camera.verticalFov / 2),
    tx = (ty * width) / height;
  return {
    image: background.image,
    forward: { x: sy * cp, y: sp, z: cy * cp },
    right: { x: cy * tx, y: 0, z: -sy * tx },
    up: { x: -sy * sp * ty, y: cp * ty, z: -cy * sp * ty },
  };
}
