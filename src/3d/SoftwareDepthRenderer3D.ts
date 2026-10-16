import type { Node3D } from './Node3D.js';
import type { PerspectiveCamera, ProjectedPoint } from './PerspectiveCamera.js';
import type { Face } from './SolidFaces.js';
import { projectFaces } from './SolidFaces.js';
import { collectFaces } from './collectFaces.js';

export interface DepthRenderStats {
  readonly submitted: number;
  readonly visible: number;
  readonly backFacing: number;
  readonly outside: number;
  readonly triangles: number;
  readonly testedSamples: number;
  readonly depthPasses: number;
  readonly bufferBytes: number;
}

const edge = (a: ProjectedPoint, b: ProjectedPoint, x: number, y: number) =>
  (a.y - b.y) * x + (b.x - a.x) * y + (a.x * b.y - a.y * b.x);
// Half-open triangle coverage: adjacent triangles own their shared edge once.
const topLeft = (a: ProjectedPoint, b: ProjectedPoint) =>
  b.y < a.y || (b.y === a.y && b.x > a.x);

/** Opaque CPU rasterizer. No Canvas, DOM, clock or external resource ownership. */
export class SoftwareDepthRenderer3D {
  #width = 0;
  #height = 0;
  #pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(0);
  #reciprocalDepth = new Float64Array(0);

  get width() {
    return this.#width;
  }
  get height() {
    return this.#height;
  }
  /** Borrowed RGBA buffer; reused/cleared by the next draw, replaced on resize. Do not mutate. */
  get pixels(): Uint8ClampedArray<ArrayBuffer> {
    return this.#pixels;
  }

  /** Camera-space Z, not Euclidean distance. Infinity means untouched background. */
  depthAt(x: number, y: number): number {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= this.#width ||
      y >= this.#height
    )
      throw new RangeError('Pixel is outside the depth buffer');
    const q = this.#reciprocalDepth[y * this.#width + x]!;
    return q > 0 ? 1 / q : Infinity;
  }

  render(
    root: Node3D,
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): DepthRenderStats {
    return this.drawFaces(collectFaces(root), camera, width, height);
  }

  /** Clears both buffers every call. Dimensions are raster pixels, independent of DPR. */
  drawFaces(
    faces: readonly Face[],
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): DepthRenderStats {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > 4_194_304
    )
      throw new RangeError(
        'Raster dimensions must be positive integers, at most 4194304 pixels',
      );
    // Shared culling/clipping; preserve submission order instead of sorting faces.
    const projection = projectFaces(faces, camera, width, height, false);
    const colors = projection.visible.map((f) => {
      if (!/^#[0-9a-f]{6}$/i.test(f.color))
        throw new Error(
          'Software depth materials require opaque #rrggbb colors',
        );
      const rgb = Number.parseInt(f.color.slice(1), 16);
      return [rgb >> 16, (rgb >> 8) & 255, rgb & 255] as const;
    });
    if (width !== this.#width || height !== this.#height) {
      const pixels = new Uint8ClampedArray(width * height * 4);
      const depth = new Float64Array(width * height);
      this.#width = width;
      this.#height = height;
      this.#pixels = pixels;
      this.#reciprocalDepth = depth;
    }
    this.#pixels.fill(0);
    this.#reciprocalDepth.fill(0);
    let triangles = 0,
      testedSamples = 0,
      depthPasses = 0;
    for (
      let faceIndex = 0;
      faceIndex < projection.visible.length;
      faceIndex++
    ) {
      const { points } = projection.visible[faceIndex]!;
      const rgb = colors[faceIndex]!;
      for (let i = 1; i + 1 < points.length; i++) {
        const a = points[0]!;
        let b = points[i]!,
          c = points[i + 1]!;
        let area = edge(a, b, c.x, c.y);
        if (!Number.isFinite(area) || area === 0) continue;
        if (area < 0) {
          [b, c] = [c, b];
          area = -area;
        }
        triangles++;
        const minX = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x) - 0.5));
        const maxX = Math.min(
          width - 1,
          Math.floor(Math.max(a.x, b.x, c.x) - 0.5),
        );
        const minY = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y) - 0.5));
        const maxY = Math.min(
          height - 1,
          Math.floor(Math.max(a.y, b.y, c.y) - 0.5),
        );
        const ab = topLeft(a, b),
          bc = topLeft(b, c),
          ca = topLeft(c, a);
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const e0 = edge(b, c, x + 0.5, y + 0.5);
            const e1 = edge(c, a, x + 0.5, y + 0.5);
            const e2 = edge(a, b, x + 0.5, y + 0.5);
            if (
              e0 < 0 ||
              (e0 === 0 && !bc) ||
              e1 < 0 ||
              (e1 === 0 && !ca) ||
              e2 < 0 ||
              (e2 === 0 && !ab)
            )
              continue;
            testedSamples++;
            // 1/Z is affine in screen space. Linear camera Z interpolation is wrong here.
            const q =
              (e0 * a.reciprocalDepth +
                e1 * b.reciprocalDepth +
                e2 * c.reciprocalDepth) /
              area;
            const pixel = y * width + x;
            if (q <= this.#reciprocalDepth[pixel]!) continue;
            this.#reciprocalDepth[pixel] = q;
            const offset = pixel * 4;
            this.#pixels[offset] = rgb[0];
            this.#pixels[offset + 1] = rgb[1];
            this.#pixels[offset + 2] = rgb[2];
            this.#pixels[offset + 3] = 255;
            depthPasses++;
          }
        }
      }
    }
    return {
      submitted: projection.submitted,
      visible: projection.visible.length,
      backFacing: projection.backFacing,
      outside: projection.outside,
      triangles,
      testedSamples,
      depthPasses,
      bufferBytes: this.#pixels.byteLength + this.#reciprocalDepth.byteLength,
    };
  }
}
