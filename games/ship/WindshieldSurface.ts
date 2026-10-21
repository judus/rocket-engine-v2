import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  multiplyMatrices,
  transformMatrix,
} from '../../src/3d/index.js';
import type { Vec3, Matrix4, DynamicTextureImage } from '../../src/3d/index.js';
import { normalMatrix } from '../../src/3d/NormalMatrix.js';
import type { VideoTextureImage } from '../../src/3d/index.js';
import { callFrame } from './WindshieldApp.js';
import type { WindshieldHud } from './WindshieldHud.js';

export const cockpitPaneNames = [
  'WindshieldSurface',
  'WindowSurfaceLeft',
  'WindowSurfaceRight',
  'WindowSurfaceTopLeft',
  'WindowSurfaceTopRight',
] as const;
export type WindshieldMode = 'clear' | 'display';
export const windshieldMesh = { repeat: [480, 340] as const, fill: 0.8 };
const transitionSeconds = 0.55;
export const frontWindshieldExtraTiltDegrees = 1.5;

/** Game presentation on authored GLB panes, with a small explicit front-pane tilt adjustment. */
export class WindshieldSurface {
  readonly panes: readonly Node3D[];
  readonly pane: Node3D;
  readonly screen = new Node3D('windshield mesh screen');
  readonly callScreen = new Node3D('windshield call video');
  #callImage: VideoTextureImage | null = null;
  readonly screens: readonly Node3D[];
  #mode: WindshieldMode = 'clear';
  #progress = 0;
  constructor(
    modelRoot: Node3D,
    private readonly hud: WindshieldHud,
    pilotEye: Vec3,
  ) {
    const nodes = new Map<string, Node3D[]>();
    modelRoot.traverse((node) => {
      const entries = nodes.get(node.name) ?? [];
      entries.push(node);
      nodes.set(node.name, entries);
    });
    this.panes = Object.freeze(
      cockpitPaneNames.map((name) => {
        const matches = nodes.get(name);
        if (matches?.length !== 1 || !matches[0]!.mesh)
          throw new Error(`Cockpit requires one mesh named ${name}`);
        const pane = matches[0]!;
        const geometry = pane.mesh!.geometry;
        if (
          !geometry.faces.length ||
          geometry.texCoords.length !== geometry.vertices.length ||
          geometry.vertices.some((v) => Math.abs(v.z) > 1e-6)
        )
          throw new Error(`Invalid planar cockpit surface: ${name}`);
        return pane;
      }),
    );
    this.pane = this.panes[0]!;
    const authored = this.pane.worldMatrix();
    const targetTilt =
      Math.atan2(-authored[6], authored[5]) +
      (frontWindshieldExtraTiltDegrees * Math.PI) / 180;
    // Convert the requested game-space tilt through the GLB's nonuniform scale.
    const slope = Math.tan(targetTilt);
    const localTilt = Math.atan(
      -(authored[6] + slope * authored[5]) /
        (authored[10] + slope * authored[9]),
    );
    this.pane.matrix = multiplyMatrices(
      this.pane.matrix ?? transformMatrix(this.pane.transform),
      transformMatrix({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: localTilt, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }),
    );
    const world = this.pane.worldMatrix();
    // Place the fixed aiming mark at the pilot's forward sightline on this actual plane.
    // The local +Z offset moves projection toward the pilot, away from the glass.
    const eye = localPoint(world, pilotEye);
    const ahead = localPoint(world, { ...pilotEye, z: pilotEye.z + 1 });
    const dz = ahead.z - eye.z;
    if (Math.abs(dz) < 1e-9)
      throw new Error('Windshield is parallel to pilot sightline');
    const offset = 0.003,
      t = (offset - eye.z) / dz;
    if (t <= 0) throw new Error('Windshield must be ahead of pilot');
    hud.root.transform = {
      position: {
        x: eye.x + (ahead.x - eye.x) * t,
        y: eye.y + (ahead.y - eye.y) * t,
        z: offset,
      },
      rotation: { x: 0, y: 0, z: 0 },
      scale: {
        x: 1 / Math.hypot(world[0], world[1], world[2]),
        y: 1 / Math.hypot(world[4], world[5], world[6]),
        z: 1,
      },
    };
    this.pane.add(hud.root);
    for (const pane of this.panes)
      pane.castsShadow = pane.receivesShadow = false;
    for (const pane of this.panes)
      pane.mesh = new Mesh3D(pane.mesh!.geometry, [
        { color: '#86b9bd', opacity: 0.025, unlit: true },
      ]);
    this.screens = Object.freeze(
      this.panes.map((pane, index) => {
        const screen =
          index === 0 ? this.screen : new Node3D(`${pane.name} mesh screen`);
        screen.mesh = new Mesh3D(pane.mesh!.geometry, [
          {
            color: '#080b0e',
            opacity: 0.96,
            unlit: true,
            screenDoor: windshieldMesh,
          },
        ]);
        screen.transform = {
          ...screen.transform,
          position: { x: 0, y: 0, z: 0.001 },
        };
        screen.castsShadow = screen.receivesShadow = false;
        pane.add(screen);
        return screen;
      }),
    );
    const vertices = this.pane.mesh!.geometry.vertices;
    hud.configureScreenDoor(windshieldMesh, {
      minX: Math.min(...vertices.map((v) => v.x)),
      maxX: Math.max(...vertices.map((v) => v.x)),
      minY: Math.min(...vertices.map((v) => v.y)),
      maxY: Math.max(...vertices.map((v) => v.y)),
    });
    this.callScreen.castsShadow = this.callScreen.receivesShadow = false;
    this.callScreen.transform = {
      ...this.callScreen.transform,
      position: { x: 0, y: 0, z: 0.001 },
    };
    this.callScreen.visible = false;
    this.callScreen.renderOrder = 1;
    this.screen.add(this.callScreen);
    this.apply();
  }
  setCallVideo(image: VideoTextureImage | null): void {
    this.callScreen.visible = image !== null;
    if (image === this.#callImage) return;
    this.#callImage = image;
    if (!image) {
      this.callScreen.mesh = null;
      return;
    }
    const points = this.pane.mesh!.geometry.vertices;
    const minX = Math.min(...points.map((v) => v.x)),
      maxX = Math.max(...points.map((v) => v.x));
    const minY = Math.min(...points.map((v) => v.y)),
      maxY = Math.max(...points.map((v) => v.y));
    const x = callFrame.x / 2048,
      y = callFrame.y / 1408;
    const w = callFrame.size / 2048,
      h = callFrame.size / 1408;
    const point = (u: number, v: number) => ({
      x: minX + u * (maxX - minX),
      y: minY + v * (maxY - minY),
      z: 0,
    });
    const geometry = new MeshGeometry(
      [
        point(x, 1 - y - h),
        point(x + w, 1 - y - h),
        point(x + w, 1 - y),
        point(x, 1 - y),
      ],
      [{ id: 'call', indices: [0, 1, 2, 3], material: 0 }],
      [],
      {
        texCoords: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    );
    this.callScreen.mesh = new Mesh3D(geometry, [
      {
        color: '#ffffff',
        opacity: 0.96,
        unlit: true,
        saturation: 0.25,
        baseColorTexture: {
          image,
          filter: 'linear',
          wrapS: 'clamp',
          wrapT: 'clamp',
        },
        screenDoor: {
          fill: windshieldMesh.fill,
          repeat: [windshieldMesh.repeat[0] * w, windshieldMesh.repeat[1] * h],
          offset: [windshieldMesh.repeat[0] * x, windshieldMesh.repeat[1] * y],
        },
      },
    ]);
  }
  setDisplayImage(image: DynamicTextureImage): void {
    this.screen.mesh = new Mesh3D(this.screen.mesh!.geometry, [
      {
        color: '#ffffff',
        baseColorTexture: {
          image,
          filter: 'linear',
          wrapS: 'clamp',
          wrapT: 'clamp',
        },
        opacity: 0.96,
        unlit: true,
        screenDoor: windshieldMesh,
      },
    ]);
  }
  get mode(): WindshieldMode {
    return this.#mode;
  }
  setMode(mode: WindshieldMode): void {
    if (mode !== 'clear' && mode !== 'display')
      throw new Error('Invalid windshield mode');
    if (mode === this.#mode) return;
    this.#mode = mode;
  }
  get transition(): number {
    return this.#progress;
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0)
      throw new Error('Invalid windshield transition delta');
    const next = Math.max(
      0,
      Math.min(
        1,
        this.#progress +
          ((this.#mode === 'display' ? 1 : -1) * dt) / transitionSeconds,
      ),
    );
    if (next === this.#progress) return;
    this.#progress = next;
    this.apply();
  }
  private apply(): void {
    const p = this.#progress;
    for (const screen of this.screens) screen.opacity = p * p * (3 - 2 * p);
    const display = p >= 0.35;
    this.hud.setDisplayMode(display);
    const alpha = display ? Math.min(1, (p - 0.35) / 0.5) : 1 - p / 0.35;
    this.hud.setProjectionFade(alpha * alpha * (3 - 2 * alpha));
  }
}

function localPoint(world: Matrix4, point: Vec3): Vec3 {
  const inverseTranspose = normalMatrix(world);
  const p = {
    x: point.x - world[12],
    y: point.y - world[13],
    z: point.z - world[14],
  };
  const dot = (i: number) =>
    inverseTranspose[i]! * p.x +
    inverseTranspose[i + 1]! * p.y +
    inverseTranspose[i + 2]! * p.z;
  return { x: dot(0), y: dot(3), z: dot(6) };
}
