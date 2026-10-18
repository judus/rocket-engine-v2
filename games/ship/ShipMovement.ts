import { ShipCooling } from './ShipCooling.js';
import type { CoolingReading } from './ShipCooling.js';
import { ShipDampers } from './ShipDampers.js';
import type { DamperReading } from './ShipDampers.js';
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
  readonly dampers: Readonly<DamperReading>;
  readonly cooling: Readonly<CoolingReading>;
  readonly shipG: number;
  readonly crewG: number;
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
    private readonly dampers: ShipDampers,
    private readonly cooling: ShipCooling,
  ) {
    this.requires = [control, engine, power, body, dampers, cooling];
    this.#telemetry = Object.freeze({
      tick: 0,
      timeSeconds: 0,
      body: body.telemetry,
      power: power.telemetry,
      engine: engine.telemetry,
      dampers: dampers.telemetry,
      cooling: cooling.telemetry,
      shipG: 0,
      crewG: 0,
      worldForceN: Object.freeze({ x: 0, y: 0, z: 0 }),
    });
  }
  fixedUpdate(dt: number): undefined {
    numberIn('ship fixed step', dt, 1e-6, 1);
    const requestedEngine = this.engine.declare(this.control.intent);
    this.dampers.declare(this.control.intent, requestedEngine, dt);
    this.cooling.declare();
    this.power.allocate(dt);
    const delivered = this.engine.deliver();
    const damperReading = this.dampers.deliver(delivered.activityFraction);
    this.engine.generateHeat(dt);
    this.dampers.generateHeat(dt);
    const coolingReading = this.cooling.deliver(dt);
    this.engine.finishThermalStep(dt);
    this.dampers.finishThermalStep(dt);
    const engineForce = this.body.localToWorld(delivered.thrustN);
    const worldForceN = Object.freeze({
      x: engineForce.x + damperReading.worldForceN.x,
      y: engineForce.y + damperReading.worldForceN.y,
      z: engineForce.z + damperReading.worldForceN.z,
    });
    this.body.advance(
      worldForceN,
      delivered.yawTorqueNm + damperReading.yawTorqueNm,
      dt,
    );
    const shipG =
      Math.hypot(worldForceN.x, worldForceN.y, worldForceN.z) /
      this.body.massKg /
      9.80665;
    this.#telemetry = Object.freeze({
      tick: this.#telemetry.tick + 1,
      timeSeconds: this.#telemetry.timeSeconds + dt,
      body: this.body.telemetry,
      power: this.power.telemetry,
      engine: this.engine.telemetry,
      cooling: coolingReading,
      dampers: this.dampers.telemetry,
      shipG,
      crewG: shipG * damperReading.transmittedFraction,
      worldForceN,
    });
  }
  get telemetry(): Readonly<ShipTelemetry> {
    return this.#telemetry;
  }
}
