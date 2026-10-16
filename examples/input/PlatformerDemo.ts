/** Small demo-owned side-view simulation, not an engine movement controller. */
export interface DemoBlock {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export const platformerBlocks: readonly DemoBlock[] = [
  { x: 0, y: 480, width: 2400, height: 60 },
  { x: 270, y: 400, width: 150, height: 20 },
  { x: 520, y: 320, width: 160, height: 20 },
  { x: 800, y: 385, width: 180, height: 20 },
  { x: 1120, y: 400, width: 150, height: 20 },
  { x: 1380, y: 320, width: 180, height: 20 },
  { x: 1740, y: 390, width: 200, height: 20 },
];
export class PlatformerDemo {
  x = 80;
  /** Feet position in the Y-down canvas. */
  y = 480;
  velocityY = 0;
  grounded = true;
  facing = 1;
  #jumpRequested = false;

  requestJump(): void {
    // No midair jump buffering: a new press after landing is required.
    if (this.grounded) this.#jumpRequested = true;
  }
  reset(): void {
    this.x = 80;
    this.y = 480;
    this.velocityY = 0;
    this.grounded = true;
    this.facing = 1;
    this.#jumpRequested = false;
  }
  /** Called by Rocket's fixed update, with the action snapshot for this frame. */
  step(dt: number, horizontal: number, sprint: boolean): void {
    if (this.#jumpRequested && this.grounded) this.velocityY = -600;
    this.#jumpRequested = false;
    const oldX = this.x;
    this.x = Math.max(
      12,
      Math.min(2388, this.x + horizontal * (sprint ? 300 : 180) * dt),
    );
    if (horizontal) this.facing = Math.sign(horizontal);
    for (const block of platformerBlocks) {
      if (this.y <= block.y || this.y - 32 >= block.y + block.height) continue;
      if (oldX + 12 <= block.x && this.x + 12 > block.x) this.x = block.x - 12;
      if (
        oldX - 12 >= block.x + block.width &&
        this.x - 12 < block.x + block.width
      )
        this.x = block.x + block.width + 12;
    }
    const oldY = this.y;
    this.velocityY += 1400 * dt;
    this.y += this.velocityY * dt;
    this.grounded = false;
    for (const block of platformerBlocks) {
      if (this.x + 12 <= block.x || this.x - 12 >= block.x + block.width)
        continue;
      if (this.velocityY >= 0 && oldY <= block.y && this.y >= block.y) {
        this.y = block.y;
        this.velocityY = 0;
        this.grounded = true;
      } else if (
        this.velocityY < 0 &&
        oldY - 32 >= block.y + block.height &&
        this.y - 32 <= block.y + block.height
      ) {
        this.y = block.y + block.height + 32;
        this.velocityY = 0;
      }
    }
  }
}
