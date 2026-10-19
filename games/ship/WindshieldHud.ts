import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { GeometryFace, Vec3 } from '../../src/3d/index.js';
import { cockpitReticle } from '../../examples/webgl/CockpitReticle.js';
import type { CockpitReading } from './CockpitReadings.js';

/** Fit to the windshield framing; this is a game presentation calibration. */
export const windshieldProjection = {
  opacity: 0.55,
  tiltDegrees: -13.7,
  anchor: { x: 0, y: 1.48, z: 0.397 },
  behindFrameM: 0.12,
} as const;

/** Glyph coverage becomes geometry: untouched pixels remain genuinely empty space. */
export function hudGlyphGeometry(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): MeshGeometry {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    rgba.length !== width * height * 4
  )
    throw new Error('Invalid HUD glyph raster');
  const vertices: Vec3[] = [],
    faces: GeometryFace[] = [];
  const unit = 1.4 / width;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (rgba[(y * width + x) * 4 + 3]! < 64) {
        x++;
        continue;
      }
      const start = x++;
      while (x < width && rgba[(y * width + x) * 4 + 3]! >= 64) x++;
      const n = vertices.length;
      vertices.push(
        { x: start * unit, y: -y * unit, z: 0 },
        { x: start * unit, y: -(y + 1) * unit, z: 0 },
        { x: x * unit, y: -(y + 1) * unit, z: 0 },
        { x: x * unit, y: -y * unit, z: 0 },
      );
      faces.push({
        id: String(faces.length),
        indices: [n, n + 1, n + 2, n + 3],
        material: 0,
      });
    }
  }
  return new MeshGeometry(vertices, faces);
}
export type HudRasterizer = (
  text: string,
  alignment: CanvasTextAlign,
) => MeshGeometry;
function browserRasterizer(): HudRasterizer {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 36;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('HUD glyph canvas unavailable');
  return (text, alignment) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '24px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = alignment;
    ctx.textBaseline = 'top';
    ctx.fillText(
      text,
      alignment === 'center' ? 256 : alignment === 'right' ? 512 : 0,
      2,
      512,
    );
    return hudGlyphGeometry(512, 36, ctx.getImageData(0, 0, 512, 36).data);
  };
}
/** One pilot-rig projection: text and independently movable reticle parts share tilt/alpha/depth. */
export class WindshieldHud {
  readonly root = new Node3D('windshield HUD projection');
  readonly reticle = cockpitReticle('hi3d');
  #opacity = windshieldProjection.opacity as number;
  #displayMode = false;
  #reticleMaterials = new Map<Node3D, Mesh3D>();
  #lines = new Map<
    string,
    { node: Node3D; text: string; color: string; alignment: CanvasTextAlign }
  >();
  constructor(private readonly rasterize: HudRasterizer = browserRasterizer()) {
    this.reticle.transform = {
      ...this.reticle.transform,
      position: { x: 0, y: 0, z: 0 },
    };
    this.root.add(this.reticle);
    this.reticle.traverse((node) => {
      if (node.mesh) this.#reticleMaterials.set(node, node.mesh);
    });
    for (const [key, x, y, alignment] of [
      ['heading', -0.7, 1.4, 'center'],
      ['speed', -2.1, 1.5, 'left'],
      ['mode', -2.1, 1.35, 'left'],
      ['target', -0.7, 1.5, 'center'],
      ['weapons', -0.7, 1.35, 'center'],
      ['heat', 0.7, 1.5, 'right'],
      ['alert', 0.7, 1.35, 'right'],
    ] as const) {
      const node = new Node3D(`HUD ${key}`);
      node.transform = { ...node.transform, position: { x, y, z: 0 } };
      node.castsShadow = node.receivesShadow = false;
      this.root.add(node);
      this.#lines.set(key, { node, text: '', color: '', alignment });
    }
    this.setAppearance(
      windshieldProjection.opacity,
      windshieldProjection.tiltDegrees,
    );
  }
  setAppearance(opacity: number, tiltDegrees: number): void {
    if (
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1 ||
      !Number.isFinite(tiltDegrees) ||
      Math.abs(tiltDegrees) >= 80
    )
      throw new Error('Invalid HUD projection opacity or tilt');
    this.#opacity = opacity;
    this.root.transform = {
      ...this.root.transform,
      rotation: { x: (tiltDegrees * Math.PI) / 180, y: 0, z: 0 },
    };
    for (const [node, mesh] of this.#reticleMaterials)
      node.mesh = new Mesh3D(
        mesh.geometry,
        mesh.materials.map((m) => ({
          ...m,
          opacity: ((m.opacity ?? 1) / windshieldProjection.opacity) * opacity,
        })),
      );
    for (const line of this.#lines.values())
      if (line.node.mesh)
        line.node.mesh = this.mesh(line.node.mesh.geometry, line.color);
  }
  private mesh(geometry: MeshGeometry, color: string): Mesh3D {
    return new Mesh3D(geometry, [
      {
        color,
        unlit: true,
        opacity: this.#opacity,
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    ]);
  }
  setDisplayMode(active: boolean): void {
    this.#displayMode = active;
    this.reticle.visible = !active;
    for (const [key, line] of this.#lines) {
      const upper = ['speed', 'target', 'heat'].includes(key);
      line.node.transform = {
        ...line.node.transform,
        position: {
          ...line.node.transform.position,
          y:
            key === 'heading'
              ? 1.4
              : (upper ? 1.5 : 1.35) - (active ? 0.28 : 0),
        },
      };
      if (key === 'heading') line.node.visible = active;
    }
  }
  update(reading: CockpitReading): void {
    for (const [key, line] of this.#lines) {
      const text =
        key === 'heading'
          ? this.#displayMode
            ? 'WINDSHIELD / SHIP SYSTEMS'
            : ''
          : reading[
              key as 'speed' | 'mode' | 'target' | 'weapons' | 'heat' | 'alert'
            ];
      const color =
        key === 'alert'
          ? reading.critical
            ? '#ff8b79'
            : '#edba76'
          : '#86ead6';
      if (text === line.text && color === line.color) continue;
      line.node.visible = text.length > 0;
      if (text)
        line.node.mesh = this.mesh(
          text === line.text && line.node.mesh
            ? line.node.mesh.geometry
            : this.rasterize(text, line.alignment),
          color,
        );
      line.text = text;
      line.color = color;
    }
  }
}
