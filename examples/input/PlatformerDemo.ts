/** Small demo-owned side-view simulation, not an engine movement controller. */
import { solvePlatformer } from '../../games/platformer/solvePlatformer.js';
import type { Platform } from '../../games/platformer/solvePlatformer.js';
export const platformerBlocks: readonly Platform[] = [
  { x: 0, y: 480, width: 2400, height: 60 },
  { x: 270, y: 400, width: 150, height: 20 },
  { x: 520, y: 320, width: 160, height: 20 },
  { x: 800, y: 385, width: 180, height: 20 },
  { x: 1120, y: 400, width: 150, height: 20 },
  { x: 1380, y: 320, width: 180, height: 20 },
  { x: 1740, y: 390, width: 200, height: 20 },
];
export const platformerWorld = {
  platforms: platformerBlocks,
  gravity: 1400,
  bounds: { left: 0, right: 2400 },
};
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
    const state = {
      velocityX: horizontal * (sprint ? 300 : 180),
      velocityY: this.velocityY,
      grounded: this.grounded,
    };
    if (horizontal) this.facing = Math.sign(horizontal);
    solvePlatformer(
      this,
      state,
      { width: 24, height: 32 },
      platformerWorld,
      dt,
    );
    this.velocityY = state.velocityY;
    this.grounded = state.grounded;
  }
}
