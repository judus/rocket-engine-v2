import { Node2D } from '../src/index.js';

export interface ArmOptions {
  x: number;
  y: number;
  color?: string;
  image?: CanvasImageSource;
  onCleanup?: () => void;
}
export interface Arm {
  readonly node: Node2D;
  readonly updates: number;
  moveBy(dx: number, dy: number): void;
  moveTo(point: { x: number; y: number }): void;
  pause(): void;
  resume(): void;
}

// A factory exposes capabilities rather than child names or an engine locator.
export function createArm({
  x,
  y,
  color = '#80dbbd',
  image,
  onCleanup = () => {},
}: ArmOptions): Arm {
  let baseX = x,
    baseY = y;
  let target: { x: number; y: number } | null = null;
  let elapsed = 0,
    updates = 0,
    moving = true;
  const node = new Node2D({
    x,
    y,
    draw(ctx) {
      ctx.fillStyle = '#34465d';
      ctx.fillRect(-30, -10, 60, 28);
      if (image) ctx.drawImage(image, -30, -10, 60, 28);
    },
  });
  const shoulder = node.add(new Node2D({ draw: link(85, color) }));
  const elbow = shoulder.add(new Node2D({ x: 85, draw: link(65, '#f1b973') }));
  const tool = elbow.add(
    new Node2D({
      x: 65,
      draw(ctx) {
        ctx.strokeStyle = '#eb8fba';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(16, -12);
        ctx.moveTo(0, 12);
        ctx.lineTo(16, 12);
        ctx.stroke();
      },
    }),
  );
  node.attach({
    update(dt, _frame, host) {
      updates++;
      if (moving) elapsed += dt;
      if (target) {
        baseX = target.x - Math.sin(elapsed * 0.6) * 32;
        baseY = target.y;
        target = null;
      }
      host.x = baseX + Math.sin(elapsed * 0.6) * 32;
      host.y = baseY;
    },
    dispose() {
      onCleanup();
    },
  });
  shoulder.attach({
    update() {
      shoulder.rotation = -1.2 + Math.sin(elapsed) * 0.4;
    },
  });
  elbow.attach({
    update() {
      elbow.rotation = 1.3 + Math.sin(elapsed * 1.4) * 0.6;
    },
  });
  tool.attach({
    update() {
      tool.rotation = Math.sin(elapsed * 2) * 0.25;
    },
  });
  return {
    node,
    get updates() {
      return updates;
    },
    moveBy(dx, dy) {
      baseX += dx;
      baseY += dy;
    },
    moveTo(point) {
      target = { ...point };
    },
    pause() {
      moving = false;
    },
    resume() {
      moving = true;
    },
  };
}

function link(
  length: number,
  color: string,
): (ctx: CanvasRenderingContext2D) => undefined {
  return (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, -6, length, 12);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101b2b';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  };
}
