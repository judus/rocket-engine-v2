import type { Matrix2D, Point } from './types.js';
function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/** Top-left world origin and positive zoom; screen positions use logical pixels. */
export class Camera2D {
  #x = 0;
  #y = 0;
  #zoom = 1;

  get x() {
    return this.#x;
  }
  set x(value: number) {
    this.#x = finite(value, 'camera.x');
  }
  get y() {
    return this.#y;
  }
  set y(value: number) {
    this.#y = finite(value, 'camera.y');
  }
  get zoom() {
    return this.#zoom;
  }
  set zoom(value: number) {
    finite(value, 'camera.zoom');
    if (value <= 0) throw new RangeError('camera.zoom must be positive');
    this.#zoom = value;
  }

  /** World-to-logical-screen affine transform. Rotation can extend this without changing consumers. */
  get matrix(): Matrix2D {
    return this.matrixAt(1);
  }
  matrixAt(ratio: number): Matrix2D {
    finite(ratio, 'ratio');
    if (ratio <= 0) throw new RangeError('ratio must be positive');
    return [
      ratio * this.#zoom,
      0,
      0,
      ratio * this.#zoom,
      -this.#x * ratio * this.#zoom,
      -this.#y * ratio * this.#zoom,
    ];
  }
  worldToScreen(point: Point): Point {
    return transformPoint(this.matrix, point);
  }

  screenToWorld(point: Point): Point {
    return inversePoint(this.matrix, point);
  }
}

export function transformPoint(
  [a, b, c, d, e, f]: Matrix2D,
  { x, y }: Point,
): Point {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
export function inversePoint(
  [a, b, c, d, e, f]: Matrix2D,
  { x, y }: Point,
): Point {
  if (b === 0 && c === 0) return { x: (x - e) / a, y: (y - f) / d };
  const determinant = a * d - b * c;
  return {
    x: (d * (x - e) - c * (y - f)) / determinant,
    y: (-b * (x - e) + a * (y - f)) / determinant,
  };
}
