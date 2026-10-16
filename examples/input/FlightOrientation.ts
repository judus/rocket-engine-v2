import type { Vec3 } from '../../src/3d/index.js';
const mix = (a: Vec3, b: Vec3, c: number, s: number): Vec3 => ({
  x: a.x * c + b.x * s,
  y: a.y * c + b.y * s,
  z: a.z * c + b.z * s,
});
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
/** Demo-owned free-flight attitude shared by the input and cockpit demos. */
export class FlightOrientation {
  right: Vec3 = { x: 1, y: 0, z: 0 };
  up: Vec3 = { x: 0, y: 1, z: 0 };
  forward: Vec3 = { x: 0, y: 0, z: 1 };
  setAngles(yaw: number, pitch: number, roll = 0): void {
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const right = { x: cy, y: 0, z: -sy },
      up = { x: -sy * sp, y: cp, z: -cy * sp };
    this.forward = { x: sy * cp, y: sp, z: cy * cp };
    this.right = mix(right, up, Math.cos(roll), -Math.sin(roll));
    this.up = mix(up, right, Math.cos(roll), Math.sin(roll));
  }
  get angles() {
    const yaw = Math.atan2(this.forward.x, this.forward.z),
      pitch = Math.asin(Math.max(-1, Math.min(1, this.forward.y)));
    const baseRight = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const baseUp = cross(this.forward, baseRight);
    const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
    return {
      yaw,
      pitch,
      roll: Math.atan2(-dot(this.right, baseUp), dot(this.right, baseRight)),
    };
  }
  rotate(
    dt: number,
    yaw: number,
    pitch: number,
    roll: number,
    lookX = 0,
    lookY = 0,
  ): void {
    // Each rotation uses the current craft-local axes; no Euler pitch clamp.
    let angle = yaw * 1.2 * dt + lookX;
    let c = Math.cos(angle),
      s = Math.sin(angle);
    const oldRight = this.right;
    this.right = mix(oldRight, this.forward, c, -s);
    this.forward = mix(this.forward, oldRight, c, s);
    angle = pitch * 1.2 * dt - lookY;
    c = Math.cos(angle);
    s = Math.sin(angle);
    const oldUp = this.up;
    this.up = mix(oldUp, this.forward, c, -s);
    this.forward = mix(this.forward, oldUp, c, s);
    angle = roll * 1.2 * dt;
    c = Math.cos(angle);
    s = Math.sin(angle);
    const rollRight = this.right;
    this.right = mix(rollRight, this.up, c, -s);
    this.up = mix(this.up, rollRight, c, s);
    // Keep an orthonormal frame after many loops and rolls.
    this.forward = unit(this.forward);
    this.right = unit(cross(this.up, this.forward));
    this.up = cross(this.forward, this.right);
  }
}
