import { DynamicTextureImage } from '../../src/3d/index.js';
import { updateTextureFromCanvas } from '../../src/webgl/index.js';

export interface CockpitNavigationReadout {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly speed: number;
}
/** Application-owned graphics/cadence. Lower displays are simulated; overhead uses navigation controls. */
export function cockpitInstruments() {
  const make = (width = 512, height = 416) => {
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
  const radar = make(),
    telemetry = make();
  const overhead = [make(512, 128), make(512, 128), make(640, 128)] as const;
  let navigation: CockpitNavigationReadout = {
    x: 0,
    y: 1.5,
    z: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
  };
  function drawNavigation() {
    const format = (value: number) =>
      Math.abs(value) >= 10000 ? value.toExponential(1) : value.toFixed(1);
    const heading = ((navigation.yaw % 360) + 360) % 360;
    const rows = [
      `${format(navigation.x)} / ${format(navigation.y)} / ${format(navigation.z)}`,
      `${heading.toFixed(1)}° / ${navigation.pitch.toFixed(1)}°`,
      `${navigation.speed.toFixed(1)} U/S`,
    ];
    overhead.forEach(({ canvas, ctx, image }, i) => {
      ctx.fillStyle = '#090d0e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#4b3c24';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, canvas.width - 10, 118);
      ctx.fillStyle = '#e9bd70';
      ctx.font = 'bold 52px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        rows[i]!,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width - 32,
      );
      updateTextureFromCanvas(image, ctx);
    });
  }
  let time = 0,
    elapsed = 0,
    draws = 0;
  let powered = true;
  const color = '#71e5c3';
  function base(ctx: CanvasRenderingContext2D, title: string) {
    ctx.fillStyle = '#030b10';
    ctx.fillRect(0, 0, 512, 416);
    ctx.strokeStyle = '#21483f';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 488, 392);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = color;
    ctx.fillText(title, 28, 45);
    ctx.font = '15px monospace';
    ctx.fillStyle = '#91aea8';
    ctx.fillText('SIMULATED / LOCAL', 28, 388);
  }
  function redraw() {
    draws++;
    if (!powered) {
      for (const { canvas, ctx, image } of [radar, telemetry, ...overhead]) {
        ctx.fillStyle = '#020405';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        updateTextureFromCanvas(image, ctx);
      }
      return;
    }
    drawNavigation();
    let ctx = radar.ctx;
    base(ctx, 'RADAR / CONTACTS 04');
    const cx = 256,
      cy = 211,
      r = 145;
    ctx.strokeStyle = '#21483f';
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * fraction, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    const scan = time * 0.8;
    ctx.fillStyle = color;
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = (24 - i) / 200;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, scan - i * 0.035, scan - (i - 1) * 0.035);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(scan) * r, cy + Math.sin(scan) * r);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * 1.8 + 0.4 + Math.sin(time * 0.1 + i) * 0.18,
        d = 43 + i * 26;
      const x = cx + Math.cos(a) * d,
        y = cy + Math.sin(a) * d;
      ctx.fillRect(x - 3, y - 3, 7, 7);
      ctx.fillText(`0${i + 1}`, x + 9, y - 7);
    }
    ctx = telemetry.ctx;
    base(ctx, 'SHIP / TELEMETRY');
    const rows = [
      ['THRUST', 68 + 18 * Math.sin(time * 0.7)],
      ['CAPACITY', 56 + 20 * Math.sin(time * 0.35)],
      ['HULL', 98],
    ] as const;
    rows.forEach(([label, value], i) => {
      const y = 93 + i * 69;
      ctx.font = '20px monospace';
      ctx.fillStyle = '#91aea8';
      ctx.fillText(label, 32, y);
      ctx.fillStyle = color;
      ctx.fillText(`${Math.round(value)}%`, 416, y);
      ctx.fillStyle = '#16312f';
      ctx.fillRect(32, y + 12, 448, 15);
      ctx.fillStyle = color;
      ctx.fillRect(32, y + 12, (448 * value) / 100, 15);
    });
    ctx.font = '16px monospace';
    ctx.fillText('SIGNAL', 32, 293);
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = 0; x <= 448; x++) {
      const y =
        331 -
        Math.sin(x * 0.06 + time) * 8 -
        Math.sin(x * 0.018 - time * 0.6) * 15;
      if (!x) ctx.moveTo(32 + x, y);
      else ctx.lineTo(32 + x, y);
    }
    ctx.stroke();
    updateTextureFromCanvas(radar.image, radar.ctx);
    updateTextureFromCanvas(telemetry.image, telemetry.ctx);
  }
  redraw();
  return {
    radar: radar.image,
    telemetry: telemetry.image,
    overhead: overhead.map((display) => display.image) as [
      DynamicTextureImage,
      DynamicTextureImage,
      DynamicTextureImage,
    ],
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
      if (value === powered) return;
      powered = value;
      redraw();
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
