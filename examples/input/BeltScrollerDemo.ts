/** Demo-owned ground plane and jump height; the engine preset only binds actions. */
export class BeltScrollerDemo {
  x = 80;
  /** Ground coordinate: larger means nearer to the viewer, never jump height. */
  depth = 390;
  height = 0;
  velocityHeight = 0;
  facing = 1;
  #jumpRequested = false;

  get grounded(): boolean {
    return this.height === 0;
  }
  requestJump(): void {
    if (this.grounded) this.#jumpRequested = true;
  }
  reset(): void {
    this.x = 80;
    this.depth = 390;
    this.height = 0;
    this.velocityHeight = 0;
    this.facing = 1;
    this.#jumpRequested = false;
  }
  step(dt: number, horizontal: number, depth: number, sprint: boolean): void {
    const length = Math.max(1, Math.hypot(horizontal, depth));
    const distance = ((sprint ? 300 : 180) * dt) / length;
    this.x = Math.max(12, Math.min(2388, this.x + horizontal * distance));
    this.depth = Math.max(300, Math.min(480, this.depth - depth * distance));
    if (horizontal) this.facing = Math.sign(horizontal);
    if (this.#jumpRequested && this.grounded) this.velocityHeight = 450;
    this.#jumpRequested = false;
    this.velocityHeight -= 1200 * dt;
    this.height = Math.max(0, this.height + this.velocityHeight * dt);
    if (this.grounded) this.velocityHeight = 0;
  }
}

/** Draw order is based on ground depth, even while jumping above another actor. */
export function drawBeltScroller(
  ctx: CanvasRenderingContext2D,
  player: BeltScrollerDemo,
  attacking: boolean,
): void {
  const scroll = Math.max(0, Math.min(1440, player.x - 320));
  ctx.fillStyle = '#152a3b';
  ctx.fillRect(0, 0, 960, 286);
  ctx.fillStyle = '#273c48';
  ctx.fillRect(0, 286, 960, 208);
  ctx.fillStyle = '#42616a';
  ctx.fillRect(0, 286, 960, 8);
  ctx.fillRect(0, 488, 960, 8);
  ctx.save();
  ctx.translate(-scroll, 0);
  ctx.strokeStyle = '#344e59';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 2400; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 294);
    ctx.lineTo(x, 488);
    ctx.stroke();
  }
  for (const y of [340, 390, 440]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2400, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#8199af';
  ctx.font = '14px monospace';
  for (let x = 0; x < 2400; x += 240) {
    ctx.fillRect(x, 154, 146, 110);
    ctx.fillStyle = '#152a3b';
    ctx.fillRect(x + 12, 166, 122, 98);
    ctx.fillStyle = '#8199af';
    ctx.fillText(`${x} →`, x + 18, 244);
  }
  const markers = [
    { x: 440, depth: 350, color: '#c89868' },
    { x: 750, depth: 430, color: '#c89868' },
    { x: 1080, depth: 390, color: '#c89868' },
    { x: 1450, depth: 350, color: '#c89868' },
    { x: 1800, depth: 430, color: '#c89868' },
  ];
  const shadow = (x: number, depth: number, radius: number) => {
    ctx.fillStyle = '#111e29';
    ctx.beginPath();
    ctx.ellipse(x, depth + 2, radius, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const marker of markers) shadow(marker.x, marker.depth, 24);
  shadow(player.x, player.depth, 20);
  const actors = [
    ...markers.map((marker) => ({ ...marker, player: false })),
    { x: player.x, depth: player.depth, color: '#80dbbd', player: true },
  ].sort((a, b) => a.depth - b.depth);
  for (const actor of actors) {
    const y = actor.depth - (actor.player ? player.height : 0);
    ctx.fillStyle = actor.color;
    ctx.fillRect(actor.x - 12, y - 48, 24, 30);
    ctx.fillRect(actor.x - 8, y - 64, 16, 14);
    ctx.fillRect(actor.x - 12, y - 16, 9, 16);
    ctx.fillRect(actor.x + 3, y - 16, 9, 16);
    ctx.fillStyle = '#081420';
    ctx.fillRect(
      actor.x + (actor.player ? player.facing : -1) * 5 - 2,
      y - 60,
      4,
      4,
    );
    if (actor.player && attacking) {
      ctx.strokeStyle = '#ffc077';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(
        actor.x + player.facing * 20,
        y - 32,
        30,
        player.facing > 0 ? -1.1 : Math.PI - 1.1,
        player.facing > 0 ? 1.1 : Math.PI + 1.1,
      );
      ctx.stroke();
    }
    if (!actor.player) {
      ctx.fillStyle = '#c89868';
      ctx.fillText('DEPTH MARKER', actor.x - 48, actor.depth + 24);
    }
  }
  ctx.fillStyle = '#ffc077';
  ctx.fillRect(2320, 295, 4, 190);
  ctx.fillRect(2324, 295, 50, 26);
  ctx.restore();
  ctx.font = '16px monospace';
  ctx.fillStyle = '#c3d9e5';
  ctx.fillText('BELT-SCROLLER    ·    PROGRESS EAST →', 24, 36);
  ctx.fillText('W / ↑: far edge    S / ↓: near edge    Space: jump', 24, 62);
  ctx.fillStyle = '#80dbbd';
  ctx.fillText('Your shadow stays at ground depth while you jump.', 24, 112);
}
