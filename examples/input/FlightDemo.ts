import { FlightOrientation } from './FlightOrientation.js';
import {
  CanvasRenderer3D,
  PerspectiveCamera,
  Node3D,
  Mesh3D,
  collectFaces,
} from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { cubeGeometry, cubeMaterials } from '../3d/CubeGeometry.js';

export interface FlightIntent {
  readonly forward: number;
  readonly right: number;
  readonly up: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  /** Relative pointer angles, applied once per rendered update, not times dt. */
  readonly lookX: number;
  readonly lookY: number;
  readonly boost: boolean;
}
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const mix = (a: Vec3, b: Vec3, c: number, s: number): Vec3 => ({
  x: a.x * c + b.x * s,
  y: a.y * c + b.y * s,
  z: a.z * c + b.z * s,
});
/** Demo policy only: a local orientation frame and assisted world-space velocity. */
export class FlightDemo extends FlightOrientation {
  position: Vec3 = { x: 0, y: 2, z: -12 };
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
  }
  reset(): void {
    this.position = { x: 0, y: 2, z: -12 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.right = { x: 1, y: 0, z: 0 };
    this.up = { x: 0, y: 1, z: 0 };
    this.forward = { x: 0, y: 0, z: 1 };
  }
  step(dt: number, input: FlightIntent): void {
    this.rotate(
      dt,
      input.yaw,
      input.pitch,
      input.roll,
      input.lookX,
      input.lookY,
    );
    const scale =
      (input.boost ? 18 : 7) /
      Math.max(1, Math.hypot(input.forward, input.right, input.up));
    const target = {
      x:
        (this.forward.x * input.forward +
          this.right.x * input.right +
          this.up.x * input.up) *
        scale,
      y:
        (this.forward.y * input.forward +
          this.right.y * input.right +
          this.up.y * input.up) *
        scale,
      z:
        (this.forward.z * input.forward +
          this.right.z * input.right +
          this.up.z * input.up) *
        scale,
    };
    const blend = 1 - Math.exp(-6 * dt);
    // Analytic exponential response: consistent acceleration/braking across frame rates.
    this.position = {
      x:
        this.position.x +
        target.x * dt +
        ((this.velocity.x - target.x) * blend) / 6,
      y:
        this.position.y +
        target.y * dt +
        ((this.velocity.y - target.y) * blend) / 6,
      z:
        this.position.z +
        target.z * dt +
        ((this.velocity.z - target.z) * blend) / 6,
    };
    this.velocity = mix(this.velocity, target, 1 - blend, blend);
  }
  toCamera(point: Vec3): Vec3 {
    const relative = {
      x: point.x - this.position.x,
      y: point.y - this.position.y,
      z: point.z - this.position.z,
    };
    return {
      x: dot(relative, this.right),
      y: dot(relative, this.up),
      z: dot(relative, this.forward),
    };
  }
}

export function createFlightDrawing(): (
  ctx: CanvasRenderingContext2D,
  craft: FlightDemo,
) => void {
  const camera = new PerspectiveCamera();
  camera.far = 400;
  const renderer = new CanvasRenderer3D(),
    root = new Node3D('flight landmarks');
  for (let i = 0; i < 24; i++) {
    const node = new Node3D(`beacon ${i}`);
    node.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
    node.transform = {
      ...node.transform,
      position: {
        x: ((i % 4) - 1.5) * 16,
        y: (Math.floor(i / 4) % 2) * 10 - 2,
        z: Math.floor(i / 8) * 30 + 12,
      },
      scale: { x: 1.5, y: 1.5, z: 1.5 },
    };
    root.add(node);
  }
  const faces = collectFaces(root);
  return (ctx, craft) => {
    const line = (a: Vec3, b: Vec3, color: string, width = 1) =>
      renderer.line(
        ctx,
        camera,
        960,
        540,
        craft.toCamera(a),
        craft.toCamera(b),
        color,
        width,
      );
    for (let n = -100; n <= 100; n += 10) {
      line({ x: n, y: -8, z: -100 }, { x: n, y: -8, z: 140 }, '#213e4c');
      line({ x: -100, y: -8, z: n }, { x: 100, y: -8, z: n }, '#213e4c');
    }
    for (const z of [20, 45, 70]) {
      const corners = [
        { x: -5, y: -3, z },
        { x: 5, y: -3, z },
        { x: 5, y: 7, z },
        { x: -5, y: 7, z },
      ];
      for (let i = 0; i < 4; i++)
        line(corners[i]!, corners[(i + 1) % 4]!, '#80dbbd', 2);
    }
    renderer.drawFaces(
      ctx,
      faces.map((face) => ({
        ...face,
        vertices: face.vertices.map((p) => craft.toCamera(p)),
      })),
      camera,
      960,
      540,
      { color: '#a1e3d0', width: 1 },
    );
    ctx.strokeStyle = '#ffc077';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(470, 270);
    ctx.lineTo(490, 270);
    ctx.moveTo(480, 260);
    ctx.lineTo(480, 280);
    ctx.stroke();
    ctx.fillStyle = '#c3d9e5';
    ctx.font = '16px monospace';
    ctx.fillText('FREE FLIGHT · fly through the green gates', 24, 34);
    ctx.fillText(
      'Arrows: pitch/yaw · Q/E: roll · Alt/Ctrl: local up/down',
      24,
      60,
    );
    ctx.fillText(
      `Speed ${craft.speed.toFixed(1)} u/s · W/S thrust · Shift boost`,
      24,
      94,
    );
    // World-axis triad, projected onto the craft's screen plane.
    for (const [label, axis, color] of [
      ['X', { x: 1, y: 0, z: 0 }, '#e69785'],
      ['Y', { x: 0, y: 1, z: 0 }, '#80dbbd'],
      ['Z', { x: 0, y: 0, z: 1 }, '#81b9e6'],
    ] as const) {
      const x = 880 + dot(axis, craft.right) * 38,
        y = 465 - dot(axis, craft.up) * 38;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(880, 465);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, x + 5, y);
    }
  };
}
