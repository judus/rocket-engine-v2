import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  TextureImage,
} from '../../src/3d/index.js';

/** Four large generated lamp faces and two round alert lenses, fitted in the same pre-tuning preview units
 * as the LCD inserts. Opaque lenses cover the baked glow even when switched off.
 * No simulation meaning, light spill, bloom or extra update clock.
 */
export function hi3dCockpitLamps() {
  const root = new Node3D('Hi3D lamp lenses');
  const lens = (powered: boolean, round = false) => {
    // Shallow lens shading; no strong bulb highlight or dark inward edge.
    if (round) {
      const size = 32,
        pixels = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const radius = Math.min(
            1,
            Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1),
          );
          const value = powered
            ? Math.round(255 * (1 - 0.1 * radius * radius))
            : Math.round(16 - 2 * radius);
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
          ? 0.32 + 0.68 * glow
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
    on = lens(true),
    roundOff = lens(false, true),
    roundOn = lens(true, true);
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
      color: '#ff9500',
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
      color: '#ff3030',
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
    const offImage = round ? roundOff : off,
      onImage = round ? roundOn : on;
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
    return {
      compensateScale(width: number, height: number) {
        if (round)
          node.transform = {
            ...node.transform,
            scale: { x: height / width, y: 1, z: 1 },
          };
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
