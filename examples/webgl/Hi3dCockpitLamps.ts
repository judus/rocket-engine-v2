import { hi3dLampUnderlay } from './Hi3dLampUnderlay.js';
import {
  matrixPoint,
  Mesh3D,
  MeshGeometry,
  Node3D,
  TextureImage,
} from '../../src/3d/index.js';
import type { PointLight3D } from '../../src/3d/index.js';

/** Four large generated lamp faces and two round alert lenses, fitted in the same pre-tuning preview units
 * as the LCD inserts. Opaque lenses cover the baked glow even when switched off.
 * Four rectangular button lights follow their lenses; round alerts have stronger spill and a rim-biased bloom source.
 * No simulation meaning or extra update clock.
 */
export function hi3dCockpitLamps() {
  const root = new Node3D('Hi3D lamp lenses');
  const lens = (powered: boolean, round = false, seed = 0, name = '') => {
    // Worn translucent glass: broad smudges and rim grime, without bulb shading.
    if (round) {
      const size = 64,
        pixels = new Uint8Array(size * size * 4);
      const hash = (x: number, y: number) => {
        const value =
          Math.sin(x * 127.1 + y * 311.7 + 19.3 + seed * 53.9) * 43758.5453;
        return value - Math.floor(value);
      };
      const dirt = (u: number, v: number) => {
        const x = Math.floor(u),
          y = Math.floor(v);
        const fx = u - x,
          fy = v - y;
        const sx = fx * fx * (3 - 2 * fx),
          sy = fy * fy * (3 - 2 * fy);
        const a = hash(x, y) * (1 - sx) + hash(x + 1, y) * sx;
        const b = hash(x, y + 1) * (1 - sx) + hash(x + 1, y + 1) * sx;
        return a * (1 - sy) + b * sy;
      };
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const radius = Math.min(
            1,
            Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1),
          );
          const u = (x + 0.5) / size,
            v = (y + 0.5) / size;
          const smudge = dirt(u * 6, v * 6);
          const speckle = dirt(u * 23, v * 23);
          const grain = hash(x, y);
          const rim = Math.max(0, (radius - 0.45) / 0.55);
          const scuff =
            (Math.abs(v - (0.23 + (seed % 7) * 0.025 + u * 0.13)) < 0.012 &&
              u > 0.18 &&
              u < 0.43) ||
            (Math.abs(v - (0.62 + (seed % 5) * 0.025 - u * 0.1)) < 0.009 &&
              u > 0.58 &&
              u < 0.84)
              ? 0.09
              : 0;
          const finish = Math.max(
            0.28,
            Math.min(
              1,
              0.99 -
                0.1 * smudge -
                0.045 * speckle -
                0.03 * grain -
                rim * (0.24 + 0.38 * smudge) +
                scuff,
            ),
          );
          // A fixed 10% source-texture luminance imprint, not alpha blending.
          const surface = 0.9 * finish + 0.1 * hi3dLampUnderlay(name, u, v);
          // A narrow bright annulus blends the lit lens into its metal seating.
          // Keep the worn center and distinct patterns in both active and standby states.
          const rimGlow = Math.exp(-Math.pow((radius - 0.91) / 0.085, 2));
          const litSurface =
            surface * (1 - rimGlow) + (0.94 + 0.06 * smudge) * rimGlow;
          const encoded = Math.min(1, litSurface);
          const linear =
            encoded <= 0.04045
              ? encoded / 12.92
              : ((encoded + 0.055) / 1.055) ** 2.4;
          const standby = linear * 0.05;
          const value = Math.round(
            255 *
              (powered
                ? encoded
                : standby <= 0.0031308
                  ? 12.92 * standby
                  : 1.055 * standby ** (1 / 2.4) - 0.055),
          );
          const i = (y * size + x) * 4;
          pixels.set([value, value, value, 255], i);
        }
      return new TextureImage(size, size, pixels);
    }
    const width = 64,
      height = 32,
      pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width,
          v = (y + 0.5) / height;
        const glow = Math.max(
          0,
          1 - Math.hypot((u - 0.5) * 1.3, (v - 0.48) * 1.5),
        );
        const edge = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 12);
        const highlight = Math.exp(-Math.pow((v - 0.2) * 18, 2)) * 0.12;
        const brightness = powered
          ? Math.min(1, (0.32 + 0.68 * glow) * 1.18)
          : 0.035 + 0.025 * glow + highlight;
        const i = (y * width + x) * 4;
        pixels[i] = Math.round(255 * brightness * (0.5 + 0.5 * edge));
        pixels[i + 1] = Math.round(
          (powered ? 205 : 150) * brightness * (0.5 + 0.5 * edge),
        );
        pixels[i + 2] = Math.round((powered ? 85 : 65) * brightness);
        pixels[i + 3] = 255;
      }
    return new TextureImage(width, height, pixels);
  };
  const off = lens(false),
    on = lens(true);
  const specs = [
    {
      name: 'overhead-left',
      x: -2.844,
      y: 3.365,
      z: -0.375,
      // Both overhead lenses use the midpoint of their fitted sizes.
      width: 0.2255,
      height: 0.092,
    },
    {
      name: 'overhead-right',
      x: 2.854,
      y: 3.365,
      z: -0.373,
      width: 0.2255,
      height: 0.092,
    },
    {
      name: 'center-console',
      x: 0,
      y: 0.163,
      z: -0.48,
      // About +4 × +2 CSS pixels at the same pilot view.
      width: 0.172,
      height: 0.107,
    },
    {
      name: 'right-console',
      x: 2.449,
      y: -0.14,
      z: -0.37,
      width: 0.173,
      height: 0.1,
    },
    {
      name: 'r1',
      x: 1.29,
      y: 3.405,
      // Just in front of the lip, covering its inward baked shadow.
      z: -0.35,
      width: 0.3,
      height: 0.3,
      round: true,
      color: '#ffcd55',
    },
    {
      name: 'r2',
      x: 1.75,
      y: 3.405,
      // Just in front of the lip, covering its inward baked shadow.
      z: -0.35,
      width: 0.3,
      height: 0.3,
      round: true,
      color: '#e65c3d',
    },
  ] as const;
  const lamps = specs.map((spec) => {
    const x = spec.width / 2,
      y = spec.height / 2,
      bevel = 0.009;
    const round = 'round' in spec;
    const circle = Array.from({ length: 40 }, (_, i) => {
      const angle = (i / 40) * Math.PI * 2;
      return { x: Math.cos(angle) * x, y: Math.sin(angle) * y, z: 0 };
    });
    const geometry = round
      ? new MeshGeometry(
          circle,
          [{ id: 'lens', indices: circle.map((_, i) => i), material: 0 }],
          [],
          {
            texCoords: circle.map((v) => [
              v.x / spec.width + 0.5,
              0.5 - v.y / spec.height,
            ]),
          },
        )
      : new MeshGeometry(
          [
            { x: -x + bevel, y: -y, z: 0 },
            { x: x - bevel, y: -y, z: 0 },
            { x, y: -y + bevel, z: 0 },
            { x, y: y - bevel, z: 0 },
            { x: x - bevel, y, z: 0 },
            { x: -x + bevel, y, z: 0 },
            { x: -x, y: y - bevel, z: 0 },
            { x: -x, y: -y + bevel, z: 0 },
          ],
          [{ id: 'lens', indices: [0, 1, 2, 3, 4, 5, 6, 7], material: 0 }],
          [],
          {
            texCoords: [
              [bevel / spec.width, 1],
              [1 - bevel / spec.width, 1],
              [1, 1 - bevel / spec.height],
              [1, bevel / spec.height],
              [1 - bevel / spec.width, 0],
              [bevel / spec.width, 0],
              [0, bevel / spec.height],
              [0, 1 - bevel / spec.height],
            ],
          },
        );
    let color: string = 'color' in spec ? spec.color : '#ffffff';
    const mesh = (image: TextureImage) =>
      new Mesh3D(geometry, [
        {
          color: '#ffffff',
          baseColorFactor: [1, 3, 5]
            .map((i) => {
              // Color-picker values are sRGB; material factors are linear.
              const channel = parseInt(color.slice(i, i + 2), 16) / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            })
            .concat(1),
          baseColorTexture: { image, wrapS: 'clamp', wrapT: 'clamp' },
          unlit: true,
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      ]);
    const seed = spec.name === 'r1' ? 17 : 83;
    const offImage = round ? lens(false, true, seed, spec.name) : off,
      onImage = round ? lens(true, true, seed, spec.name) : on;
    let dark = mesh(offImage),
      bright = mesh(onImage),
      powered = true;
    const node = new Node3D(`Hi3D lamp ${spec.name}`);
    node.transform = {
      ...node.transform,
      position: { x: spec.x, y: spec.y, z: spec.z },
    };
    node.mesh = bright;
    node.castsShadow = node.receivesShadow = false;
    root.add(node);
    let size = 1,
      aspect = 1;
    const applySize = () => {
      node.transform = {
        ...node.transform,
        scale: { x: size * aspect, y: size, z: 1 },
      };
    };
    return {
      buttonLight(): PointLight3D | undefined {
        if (round || !powered) return undefined;
        return {
          kind: 'point',
          position: matrixPoint(node.worldMatrix(), { x: 0, y: 0, z: 0.18 }),
          color: [1, 0.61, 0.09],
          intensity: spec.width * spec.height * 0.7,
          minimumDistance: 0.25,
        };
      },
      alertLight(): PointLight3D | undefined {
        if (!round) return undefined;
        const factor = bright.materials[0]!.baseColorFactor!;
        return {
          kind: 'point',
          position: matrixPoint(node.worldMatrix(), { x: 0, y: 0, z: 0.14 }),
          color: [factor[0]!, factor[1]!, factor[2]!],
          intensity:
            spec.width * spec.height * size * size * 0.9 * (powered ? 1 : 0.05),
          minimumDistance: 0.25,
        };
      },
      compensateScale(width: number, height: number) {
        aspect = round ? height / width : 1;
        applySize();
      },
      setSize(value: number) {
        size = value;
        applySize();
      },
      setPowered(value: boolean) {
        powered = value;
        node.mesh = powered ? bright : dark;
      },
      setColor(value: string) {
        if (!/^#[0-9a-f]{6}$/i.test(value))
          throw new TypeError('Lamp color must be #rrggbb');
        if (color === value) return;
        color = value;
        dark = mesh(offImage);
        bright = mesh(onImage);
        node.mesh = powered ? bright : dark;
      },
    };
  });
  return {
    root,
    /** Only the four rectangular buttons emit spill; independent of display power. */
    buttonLights(): readonly PointLight3D[] {
      return lamps.flatMap((lamp) => {
        const light = lamp.buttonLight();
        return light ? [light] : [];
      });
    },
    /** Round alert spill tracks power, live color and fitted lens size. */
    alertLights(): readonly PointLight3D[] {
      return lamps.flatMap((lamp) => {
        const light = lamp.alertLight();
        return light ? [light] : [];
      });
    },
    /** Keep round lenses circular while their centers follow the cockpit fit. */
    setCockpitScale(width: number, height: number) {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      )
        throw new RangeError('Cockpit scale must be finite and positive');
      lamps.forEach((lamp) => lamp.compensateScale(width, height));
    },
    setSize(index: number, size: number) {
      const lamp = lamps[index];
      if (!lamp) throw new RangeError('Unknown Hi3D lamp');
      if (!Number.isFinite(size) || size <= 0)
        throw new RangeError('Lamp size must be finite and positive');
      lamp.setSize(size);
    },
    setPowered(index: number, powered: boolean) {
      const lamp = lamps[index];
      if (!lamp) throw new RangeError('Unknown Hi3D lamp');
      lamp.setPowered(powered);
    },
    setColor(index: number, color: string) {
      const lamp = lamps[index];
      if (!lamp) throw new RangeError('Unknown Hi3D lamp');
      lamp.setColor(color);
    },
  };
}
