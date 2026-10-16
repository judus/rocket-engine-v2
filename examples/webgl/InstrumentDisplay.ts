/** Example-owned drawing only. Values are simulated; the engine owns texture transport, not instrument meaning. */
export function paintInstrument(
  ctx: CanvasRenderingContext2D,
  time: number,
  frame: number,
  color: string,
): void {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(w / 512, 0, 0, h / 320, 0, 0);
  ctx.fillStyle = '#06101b';
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = '#29434e';
  ctx.lineWidth = 1;
  ctx.strokeRect(8.5, 8.5, 495, 303);
  ctx.beginPath();
  ctx.moveTo(292.5, 48);
  ctx.lineTo(292.5, 282);
  ctx.stroke();
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = color;
  ctx.fillText('ROCKET / SENSOR', 22, 32);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#9cb4bf';
  ctx.fillText('SIMULATED TELEMETRY', 320, 31);
  const cx = 148,
    cy = 166,
    r = 105;
  ctx.strokeStyle = '#24434b';
  for (const size of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * size, 0, Math.PI * 2);
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
  for (let i = 0; i < 18; i++) {
    ctx.globalAlpha = (18 - i) / 160;
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
      d = 34 + i * 18;
    const x = cx + Math.cos(a) * d,
      y = cy + Math.sin(a) * d;
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.font = '10px monospace';
    ctx.fillText(`0${i + 1}`, x + 7, y - 5);
  }
  const rows = [
    ['THRUST', 68 + 18 * Math.sin(time * 0.7)],
    ['CAPACITY', 56 + 20 * Math.sin(time * 0.35)],
    ['HULL', 98],
  ] as const;
  rows.forEach(([label, value], i) => {
    const y = 71 + i * 57;
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9cb4bf';
    ctx.fillText(label, 314, y);
    ctx.fillStyle = color;
    ctx.fillText(`${Math.round(value)}%`, 441, y);
    ctx.fillStyle = '#172d38';
    ctx.fillRect(314, y + 9, 169, 10);
    ctx.fillStyle = color;
    ctx.fillRect(314, y + 9, (169 * value) / 100, 10);
  });
  ctx.font = '11px monospace';
  ctx.fillStyle = '#9cb4bf';
  ctx.fillText('SIGNAL', 314, 245);
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let x = 0; x < 170; x++) {
    const y =
      268 -
      Math.sin(x * 0.12 + time) * 5 -
      Math.sin(x * 0.035 - time * 0.6) * 10;
    if (x === 0) ctx.moveTo(314 + x, y);
    else ctx.lineTo(314 + x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#9cb4bf';
  ctx.font = '11px monospace';
  ctx.fillText(
    `CONTACTS 04    DRAW ${String(frame).padStart(6, '0')}`,
    22,
    300,
  );
  ctx.fillStyle = color;
  ctx.fillText('LOCAL / ONLINE', 367, 300);
  ctx.restore();
}
