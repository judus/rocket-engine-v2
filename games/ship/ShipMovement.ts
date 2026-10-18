import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { ShipBody } from './ShipBody.js';
import type { BodyReading } from './ShipBody.js';
import { ShipControl } from './ShipControl.js';
import { ShipEngine } from './ShipEngine.js';
import type { EngineReading } from './ShipEngine.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import { numberIn } from './ShipProfiles.js';
import type { PowerReading } from './ShipPowerPlant.js';

export interface ShipTelemetry {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly body: Readonly<BodyReading>;
  readonly power: Readonly<PowerReading>;
  readonly engine: Readonly<EngineReading>;
  readonly worldForceN: Readonly<Vec3>;
}
const shipMotion = Symbol('ship motion pipeline');
/** One ordered fixed step; calculations and state remain owned by their components. */
export class ShipMovement implements Behavior {
  readonly writes = [shipMotion];
  readonly requires: readonly Behavior[];
  #telemetry: Readonly<ShipTelemetry>;
  constructor(
    private readonly control: ShipControl,
    private readonly engine: ShipEngine,
    private readonly power: ShipPowerPlant,
    private readonly body: ShipBody,
  ) {
    this.requires = [control, engine, power, body];
    this.#telemetry = Object.freeze({
      tick: 0,
      timeSeconds: 0,
      body: body.telemetry,
      power: power.telemetry,
      engine: engine.telemetry,
      worldForceN: Object.freeze({ x: 0, y: 0, z: 0 }),
    });
  }
  fixedUpdate(dt: number): undefined {
    numberIn('ship fixed step', dt, 1e-6, 1);
    this.engine.declare(this.control.intent);
    this.power.allocate(dt);
    const delivered = this.engine.deliver();
    const worldForceN = Object.freeze(
      this.body.localToWorld(delivered.thrustN),
    );
    this.body.advance(worldForceN, delivered.yawTorqueNm, dt);
    this.#telemetry = Object.freeze({
      tick: this.#telemetry.tick + 1,
      timeSeconds: this.#telemetry.timeSeconds + dt,
      body: this.body.telemetry,
      power: this.power.telemetry,
      engine: delivered,
      worldForceN,
    });
  }
  get telemetry(): Readonly<ShipTelemetry> {
    return this.#telemetry;
  }
}
