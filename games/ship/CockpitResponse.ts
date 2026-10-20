import { Node3D } from '../../src/3d/index.js';
import { CockpitMotion } from '../../examples/webgl/CockpitMotion.js';
import type { Ship } from './Ship.js';

/** Visual seat response only; the shared child keeps frame, panes and instruments aligned. */
export class CockpitResponse {
  readonly root = new Node3D('cosmetic cockpit motion');
  private readonly motion = new CockpitMotion();
  constructor(private readonly ship: Ship) {}
  update(dt: number): void {
    const body = this.ship.telemetry.body;
    const acceleration = this.ship.body.worldToLocal(body.accelerationMps2);
    // Normalize to the installed engine, with a 1 m/s² visual reference floor
    // for valid zero-thrust profiles. This never changes ship physics.
    const reference = Math.max(
      1,
      this.ship.engine.profile.maxThrustN / this.ship.body.massKg,
    );
    this.motion.update(
      dt,
      acceleration.x / reference +
        body.yawRateRadps * 0.5 +
        body.rollRateRadps * 0.25,
      acceleration.y / reference + body.pitchRateRadps * 0.5,
      acceleration.z / reference,
    );
    this.root.transform = {
      ...this.root.transform,
      position: { x: this.motion.x, y: this.motion.y, z: this.motion.z },
    };
  }
}
