import { multiplyMatrices } from './Matrix4.js';
import type { Matrix4 } from './Matrix4.js';

/** Coordinate convention: +Y is up, +Z is forward, angles are radians. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Projected position plus reciprocal camera-space depth for raster interpolation. */
export interface ProjectedPoint extends ScreenPoint {
  readonly reciprocalDepth: number;
}

/** Perspective projection and six-plane clipping; no DOM, clock or scene ownership. */
export class PerspectiveCamera {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  /** Radians around forward: positive tilts the local right axis downward. */
  roll = 0;
  verticalFov = Math.PI / 3;
  near = 0.1;
  far = 160;

  #validateViewport(width: number, height: number): void {
    if (
      ![
        width,
        height,
        this.x,
        this.y,
        this.z,
        this.yaw,
        this.pitch,
        this.roll,
        this.verticalFov,
        this.near,
        this.far,
      ].every(Number.isFinite) ||
      this.near <= 0 ||
      this.far <= this.near ||
      width <= 0 ||
      height <= 0 ||
      this.verticalFov <= 0 ||
      this.verticalFov >= Math.PI
    )
      throw new Error(
        'Camera and viewport must be finite, with positive dimensions and FOV between 0 and pi',
      );
  }

  #cameraPoint(point: Vec3): Vec3 {
    const x = point.x - this.x,
      y = point.y - this.y,
      z = point.z - this.z,
      cy = Math.cos(this.yaw),
      sy = Math.sin(this.yaw),
      cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const horizontal = cy * x - sy * z,
      vertical = -sy * sp * x + cp * y - cy * sp * z,
      cr = Math.cos(this.roll),
      sr = Math.sin(this.roll);
    return {
      x: cr * horizontal - sr * vertical,
      y: sr * horizontal + cr * vertical,
      z: sy * cp * x + sp * y + cy * cp * z,
    };
  }

  /** World to WebGL homogeneous clip coordinates: +Z forward, NDC depth -1..1. */
  clipMatrix(width: number, height: number): Matrix4 {
    this.#validateViewport(width, height);
    const cy = Math.cos(this.yaw),
      sy = Math.sin(this.yaw),
      cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const view: Matrix4 = [
      cy,
      -sy * sp,
      sy * cp,
      0,
      0,
      cp,
      sp,
      0,
      -sy,
      -cy * sp,
      cy * cp,
      0,
      -cy * this.x + sy * this.z,
      sy * sp * this.x - cp * this.y + cy * sp * this.z,
      -sy * cp * this.x - sp * this.y - cy * cp * this.z,
      1,
    ];
    const f = 1 / Math.tan(this.verticalFov / 2),
      range = this.far - this.near;
    const projection: Matrix4 = [
      (f * height) / width,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (this.far + this.near) / range,
      1,
      0,
      0,
      (-2 * this.far * this.near) / range,
      0,
    ];
    const cr = Math.cos(this.roll),
      sr = Math.sin(this.roll);
    const roll: Matrix4 = [cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return multiplyMatrices(projection, multiplyMatrices(roll, view));
  }

  /** Clip in camera space before the perspective divide, on all six planes. */
  segment(
    start: Vec3,
    end: Vec3,
    width: number,
    height: number,
  ): readonly [ScreenPoint, ScreenPoint] | null {
    this.#validateViewport(width, height);
    const a = this.#cameraPoint(start),
      b = this.#cameraPoint(end),
      ty = Math.tan(this.verticalFov / 2),
      tx = (ty * width) / height;
    let enter = 0,
      leave = 1;
    const planes = [
      [a.z - this.near, b.z - this.near],
      [this.far - a.z, this.far - b.z],
      [a.x + a.z * tx, b.x + b.z * tx],
      [a.z * tx - a.x, b.z * tx - b.x],
      [a.y + a.z * ty, b.y + b.z * ty],
      [a.z * ty - a.y, b.z * ty - b.y],
    ] as const;
    for (const [da, db] of planes) {
      if (da < 0 && db < 0) return null;
      if (da < 0) enter = Math.max(enter, da / (da - db));
      if (db < 0) leave = Math.min(leave, da / (da - db));
      if (enter > leave) return null;
    }
    const focal = height / (2 * ty);
    const project = (t: number): ScreenPoint => {
      const z = a.z + (b.z - a.z) * t;
      return {
        x: width / 2 + ((a.x + (b.x - a.x) * t) * focal) / z,
        y: height / 2 - ((a.y + (b.y - a.y) * t) * focal) / z,
      };
    };
    return [project(enter), project(leave)];
  }

  /** Convex face clipped against the same frustum before projection. */
  polygon(
    vertices: readonly Vec3[],
    width: number,
    height: number,
  ): { points: readonly ProjectedPoint[]; depth: number } | null {
    this.#validateViewport(width, height);
    let points = vertices.map((point) => this.#cameraPoint(point));
    const ty = Math.tan(this.verticalFov / 2),
      tx = (ty * width) / height;
    const planes = [
      (p: Vec3) => p.z - this.near,
      (p: Vec3) => this.far - p.z,
      (p: Vec3) => p.x + p.z * tx,
      (p: Vec3) => p.z * tx - p.x,
      (p: Vec3) => p.y + p.z * ty,
      (p: Vec3) => p.z * ty - p.y,
    ];
    for (const distance of planes) {
      if (points.length < 3) return null;
      const clipped: Vec3[] = [];
      let previous = points[points.length - 1]!;
      let dp = distance(previous);
      for (const point of points) {
        const d = distance(point);
        if (dp < 0 !== d < 0) {
          const t = dp / (dp - d);
          clipped.push({
            x: previous.x + (point.x - previous.x) * t,
            y: previous.y + (point.y - previous.y) * t,
            z: previous.z + (point.z - previous.z) * t,
          });
        }
        if (d >= 0) clipped.push(point);
        previous = point;
        dp = d;
      }
      points = clipped;
    }
    if (points.length < 3) return null;
    const focal = height / (2 * ty);
    return {
      points: points.map((p) => ({
        x: width / 2 + (p.x * focal) / p.z,
        y: height / 2 - (p.y * focal) / p.z,
        reciprocalDepth: 1 / p.z,
      })),
      depth: points.reduce((sum, p) => sum + p.z, 0) / points.length,
    };
  }
}
