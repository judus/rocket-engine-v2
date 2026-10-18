export interface Platform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface PlatformerWorldOptions {
  platforms: readonly Platform[];
  gravity: number;
  bounds: { readonly left: number; readonly right: number };
}

export interface KinematicState {
  velocityX: number;
  velocityY: number;
  grounded: boolean;
}
/** Shared axis-separated sweep. Feet origin, static platforms and horizontal world bounds. */
export function solvePlatformer(
  node: { x: number; y: number },
  state: KinematicState,
  body: { readonly width: number; readonly height: number },
  world: Readonly<PlatformerWorldOptions>,
  dt: number,
): void {
  const half = body.width / 2;
  const oldX = node.x;
  let x = Math.max(
    world.bounds.left + half,
    Math.min(world.bounds.right - half, oldX + state.velocityX * dt),
  );
  for (const p of world.platforms) {
    if (node.y <= p.y || node.y - body.height >= p.y + p.height) continue;
    if (state.velocityX > 0 && oldX + half <= p.x && x + half > p.x)
      x = Math.min(x, p.x - half);
    if (
      state.velocityX < 0 &&
      oldX - half >= p.x + p.width &&
      x - half < p.x + p.width
    )
      x = Math.max(x, p.x + p.width + half);
  }
  if (x !== oldX + state.velocityX * dt) state.velocityX = 0;
  node.x = x;
  const oldY = node.y;
  state.velocityY += world.gravity * dt;
  let y = oldY + state.velocityY * dt;
  state.grounded = false;
  let contact = false;
  for (const p of world.platforms) {
    if (x + half <= p.x || x - half >= p.x + p.width) continue;
    if (state.velocityY >= 0 && oldY <= p.y && y >= p.y) {
      y = Math.min(y, p.y);
      contact = true;
    }
    if (
      state.velocityY < 0 &&
      oldY - body.height >= p.y + p.height &&
      y - body.height <= p.y + p.height
    ) {
      y = Math.max(y, p.y + p.height + body.height);
      contact = true;
    }
  }
  if (contact) {
    state.grounded = state.velocityY >= 0;
    state.velocityY = 0;
  } else if (state.velocityY === 0) {
    state.grounded = world.platforms.some(
      (p) => y === p.y && x + half > p.x && x - half < p.x + p.width,
    );
  }
  node.y = y;
}
