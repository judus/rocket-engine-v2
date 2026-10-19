import { DynamicTextureImage } from '../../src/3d/index.js';
import { updateTextureFromCanvas } from '../../src/webgl/index.js';
import { cockpitReadings } from './CockpitReadings.js';
import type { CockpitReading } from './CockpitReadings.js';
import type { Ship } from './Ship.js';

const cyan = '#86ead6',
  muted = '#6a9691',
  amber = '#edba76';
function display(width = 512, height = 400) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cockpit display canvas unavailable');
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return {
    canvas,
    ctx,
    image: new DynamicTextureImage(width, height, pixels),
  };
}
/** Presentation of committed ship state. No simulation, independent clock or copied ledger. */
export class CockpitInstruments {
  readonly navigation = display();
  readonly computer = display();
  readonly overhead = [
    display(448, 96),
    display(384, 96),
    display(512, 96),
  ] as const;
  #elapsed = 1;
  #page = 0;
  #status: CockpitReading;
  constructor(private readonly ship: Ship) {
    this.#status = cockpitReadings(ship.telemetry, ship.computer.telemetry);
  }
  get status(): CockpitReading {
    return this.#status;
  }
  update(dt: number): void {
    this.#elapsed += dt;
    if (this.#elapsed < 1 / 15) return;
    this.#elapsed %= 1 / 15;
    this.#status = cockpitReadings(
      this.ship.telemetry,
      this.ship.computer.telemetry,
    );
    const t = this.ship.telemetry,
      computer = this.ship.computer.telemetry;
    const all = [this.navigation, this.computer, ...this.overhead];
    for (const { ctx, canvas } of all) {
      ctx.fillStyle = '#030b0e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#21423e';
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
      ctx.fillStyle = cyan;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
    }
    const ctx = this.navigation.ctx;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('NAVIGATION / LOCAL', 18, 30);
    const cx = 256,
      cy = 195,
      radius = 130,
      range = 10000;
    ctx.strokeStyle = '#21423e';
    for (const r of [radius / 3, (radius * 2) / 3, radius]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();
    for (const contact of t.navigation.contacts) {
      if (contact.distanceM > range) continue;
      ctx.fillStyle =
        contact.id === t.navigation.destination?.id ? amber : cyan;
      ctx.fillRect(
        cx + (contact.localOffsetM.x / range) * radius - 3,
        cy - (contact.localOffsetM.z / range) * radius - 3,
        6,
        6,
      );
    }
    ctx.font = '18px monospace';
    ctx.fillStyle = cyan;
    const target = t.navigation.destination;
    ctx.fillText(target?.label ?? 'NO DESTINATION', 18, 344, 470);
    ctx.fillStyle = muted;
    ctx.font = '16px monospace';
    ctx.fillText(
      target
        ? `${(target.distanceM / 1000).toFixed(2)} km  /  ${target.arrived ? 'ARRIVED' : `${target.relativeBearingDegrees.toFixed(0)}° relative`}`
        : '10 km scope',
      18,
      370,
      470,
    );
    this.drawComputer();
    this.overhead.forEach(({ ctx, canvas }, i) => {
      const reading = this.#status.overhead[i]!;
      const color = reading.warning ? amber : reading.muted ? muted : cyan;
      ctx.fillStyle = color;
      ctx.font = 'bold 27px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(reading.label, 18, 24);
      ctx.textAlign = 'right';
      ctx.fillText(
        `${(reading.fraction * 100).toFixed(0)}%`,
        canvas.width - 18,
        24,
      );
      ctx.fillStyle = '#15312e';
      ctx.fillRect(18, 46, canvas.width - 36, 13);
      ctx.fillStyle = color;
      ctx.fillRect(18, 46, (canvas.width - 36) * reading.fraction, 13);
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(reading.footer, canvas.width / 2, 78, canvas.width - 24);
    });
    if (computer.alerts.length) {
      ctx.fillStyle = amber;
      ctx.fillRect(18, 48, 8, 8);
    }
    for (const d of all) updateTextureFromCanvas(d.image, d.ctx);
  }
  private drawComputer(): void {
    const c = this.ship.computer.telemetry,
      ctx = this.computer.ctx;
    const pages = Math.max(1, Math.ceil(c.modules.length / 5));
    this.#page %= pages;
    ctx.fillStyle = cyan;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('SHIP SYSTEMS', 18, 27);
    ctx.font = '16px monospace';
    ctx.fillStyle = muted;
    ctx.fillText(
      `RESERVE ${(c.reserveFraction * 100).toFixed(0)}%  /  ${(c.consumptionW / 1e9).toFixed(2)} GW`,
      18,
      52,
    );
    c.modules.slice(this.#page * 5, this.#page * 5 + 5).forEach((m, i) => {
      const y = 85 + i * 53;
      ctx.strokeStyle = '#21423e';
      ctx.beginPath();
      ctx.moveTo(18, y + 36);
      ctx.lineTo(494, y + 36);
      ctx.stroke();
      ctx.fillStyle = m.healthFraction < 1 ? amber : cyan;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(m.label.toUpperCase(), 18, y, 315);
      ctx.fillStyle = muted;
      ctx.font = '14px monospace';
      ctx.fillText(
        `${m.state} / ${m.temperatureK === null ? '—' : `${(m.temperatureK - 273.15).toFixed(0)}°C`} / ${(m.healthFraction * 100).toFixed(0)}%`,
        18,
        y + 22,
        350,
      );
      if (m.requested !== null) {
        ctx.fillStyle = m.requested ? '#173d36' : '#122326';
        ctx.fillRect(392, y - 12, 98, 34);
        ctx.fillStyle = m.requested ? cyan : muted;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(m.requested ? 'ON' : 'OFF', 420, y + 5);
      }
    });
    ctx.fillStyle = muted;
    ctx.font = '14px monospace';
    ctx.fillText(
      c.alerts[0]?.message ??
        `${this.ship.telemetry.dampers.mode.toUpperCase()} / CREW ${this.ship.telemetry.crewG.toFixed(1)} G`,
      18,
      350,
      475,
    );
    ctx.fillStyle = cyan;
    ctx.fillText(`SYSTEMS ${this.#page + 1}/${pages}        NEXT ›`, 18, 377);
  }
  clickComputer(x: number, y: number): void {
    if (y > 360) {
      this.#page++;
      return;
    }
    const row = Math.floor((y - 70) / 53);
    if (x < 390 || row < 0 || row >= 5 || y > 335) return;
    const m = this.ship.computer.telemetry.modules[this.#page * 5 + row];
    if (m && m.requested !== null)
      this.ship.computer.setEnabled(m.id, !m.requested);
  }
  nextDestination(): void {
    const n = this.ship.navigation.telemetry;
    const index = n.contacts.findIndex((c) => c.id === n.destination?.id);
    const next = n.contacts[(index + 1) % n.contacts.length];
    if (next) this.ship.navigation.selectDestination(next.id);
  }
}
