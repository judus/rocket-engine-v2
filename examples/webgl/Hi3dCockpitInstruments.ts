import { DynamicTextureImage } from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { updateTextureFromCanvas } from '../../src/webgl/index.js';
import type { CockpitNavigationReadout } from './CockpitInstruments.js';

/** Top-down local radar: real field centers, camera heading; scene units, no targeting. */
export function hi3dRadarContacts(
  readout: CockpitNavigationReadout,
  contacts: readonly Vec3[],
  range = 120,
) {
  const yaw = (readout.yaw * Math.PI) / 180;
  return contacts
    .map((point) => {
      const x = point.x - readout.x,
        z = point.z - readout.z;
      return {
        right: x * Math.cos(yaw) - z * Math.sin(yaw),
        forward: x * Math.sin(yaw) + z * Math.cos(yaw),
        distance: Math.hypot(x, point.y - readout.y, z),
      };
    })
    .filter((point) => point.distance <= range);
}

/** New Hi3D artwork. Readouts come from navigation and the seeded field, not fake ship systems. */
export function hi3dCockpitInstruments() {
  const make = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    return {
      canvas,
      ctx,
      image: new DynamicTextureImage(width, height, pixels),
    };
  };
  const radar = make(512, 400),
    flight = make(512, 400);
  const upper = [make(448, 96), make(384, 96), make(512, 96)] as const;
  // A static phosphor-cell mask: about two CSS pixels per cell at the pilot fit.
  // Draw over the live artwork without reducing radar/text resolution or adding a clock.
  const phosphor = document.createElement('canvas');
  phosphor.width = phosphor.height = 4;
  const phosphorContext = phosphor.getContext('2d')!;
  phosphorContext.fillStyle = 'rgba(0, 0, 0, 0.13)';
  phosphorContext.fillRect(0, 3, 4, 1);
  phosphorContext.fillStyle = 'rgba(0, 0, 0, 0.055)';
  phosphorContext.fillRect(3, 0, 1, 4);
  const phosphorMasks = [radar, flight].map(({ ctx }) =>
    ctx.createPattern(phosphor, 'repeat')!,
  );
  let navigation: CockpitNavigationReadout = {
    x: 0,
    y: 1.48,
    z: -3.37,
    yaw: 0,
    pitch: 0,
    speed: 0,
  };
  let contacts: readonly Vec3[] = [],
    elapsed = 0,
    time = 0,
    draws = 0,
    powered = true;
  const cyan = '#86ead6',
    amber = '#efc37e',
    muted = '#799f9b';
  const number = (value: number) =>
    Math.abs(value) >= 10000 ? value.toExponential(1) : value.toFixed(1);
  function redraw() {
    draws++;
    for (const display of [radar, flight, ...upper]) {
      display.ctx.fillStyle = '#030b0e';
      display.ctx.fillRect(0, 0, display.canvas.width, display.canvas.height);
    }
    if (powered) {
      const heading = ((navigation.yaw % 360) + 360) % 360;
      const rows = [
        `HDG ${heading.toFixed(1)} / P ${navigation.pitch.toFixed(1)}`,
        `${navigation.speed.toFixed(1)} U/S`,
        `X ${number(navigation.x)} Y ${number(navigation.y)} Z ${number(navigation.z)}`,
      ];
      upper.forEach(({ canvas, ctx }, i) => {
        ctx.strokeStyle = '#21423e';
        ctx.strokeRect(4, 4, canvas.width - 8, 88);
        ctx.fillStyle = cyan;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rows[i]!, canvas.width / 2, 49, canvas.width - 20);
      });
      const base = (ctx: CanvasRenderingContext2D, title: string) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = '#21423e';
        ctx.strokeRect(8, 8, 496, 384);
        ctx.fillStyle = cyan;
        ctx.font = 'bold 23px monospace';
        ctx.fillText(title, 24, 39);
        ctx.strokeStyle = '#21423e';
        ctx.beginPath();
        ctx.moveTo(24, 53);
        ctx.lineTo(488, 53);
        ctx.stroke();
      };
      let ctx = radar.ctx;
      base(ctx, 'LOCAL SCANNER / 120 U');
      const visible = hi3dRadarContacts(navigation, contacts);
      const cx = 256,
        cy = 211,
        radius = 139;
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * fraction, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();
      ctx.strokeStyle = '#3b786c';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(time) * radius, cy - Math.cos(time) * radius);
      ctx.stroke();
      ctx.fillStyle = cyan;
      for (const point of visible)
        ctx.fillRect(
          cx + (point.right / 120) * radius - 2,
          cy - (point.forward / 120) * radius - 2,
          4,
          4,
        );
      ctx.fillStyle = amber;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx - 5, cy + 5);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = muted;
      ctx.font = '16px monospace';
      ctx.fillText(`${visible.length} ROCKS / HEADING UP`, 24, 378);
      ctx = flight.ctx;
      base(ctx, 'FLIGHT / LOCAL NAV');
      ctx.fillStyle = muted;
      ctx.font = '17px monospace';
      ctx.fillText('VELOCITY', 24, 82);
      ctx.fillStyle = cyan;
      ctx.font = 'bold 65px monospace';
      ctx.fillText(navigation.speed.toFixed(1), 24, 145);
      ctx.font = '19px monospace';
      ctx.fillText('U / S', 365, 141);
      ctx.fillStyle = '#15302d';
      ctx.fillRect(24, 162, 464, 9);
      ctx.fillStyle = cyan;
      ctx.fillRect(24, 162, 464 * Math.min(1, navigation.speed / 30), 9);
      ctx.font = '20px monospace';
      ctx.fillStyle = amber;
      ctx.fillText(`HDG ${heading.toFixed(1)}°`, 24, 212);
      ctx.fillText(`PITCH ${navigation.pitch.toFixed(1)}°`, 24, 246);
      ctx.font = '18px monospace';
      ctx.fillStyle = muted;
      ctx.fillText(
        `NEAREST ${visible.length ? Math.min(...visible.map((p) => p.distance)).toFixed(1) + ' U' : '—'}`,
        24,
        291,
      );
      ctx.fillText('WASD THRUST / SHIFT BOOST', 24, 334);
      ctx.font = '15px monospace';
      ctx.fillText('NO COLLISIONS / DEMO NAV', 24, 378);
      [radar, flight].forEach(({ ctx }, i) => {
        ctx.save();
        ctx.fillStyle = phosphorMasks[i]!;
        ctx.fillRect(12, 12, 488, 376);
        ctx.restore();
      });
    }
    for (const { ctx, image } of [radar, flight, ...upper])
      updateTextureFromCanvas(image, ctx);
  }
  redraw();
  return {
    radar: radar.image,
    telemetry: flight.image,
    overhead: upper.map((d) => d.image) as [
      DynamicTextureImage,
      DynamicTextureImage,
      DynamicTextureImage,
    ],
    setContacts(value: readonly Vec3[]) {
      contacts = value;
    },
    update(
      dt: number,
      running: boolean,
      hz: number,
      readout: CockpitNavigationReadout,
    ) {
      navigation = readout;
      if (!running || !powered) return;
      time += dt;
      elapsed += dt;
      if (elapsed >= 1 / hz) {
        elapsed %= 1 / hz;
        redraw();
      }
    },
    setPowered(value: boolean) {
      if (powered !== value) {
        powered = value;
        redraw();
      }
    },
    advance() {
      time += 0.1;
      redraw();
    },
    get draws() {
      return draws;
    },
  };
}
