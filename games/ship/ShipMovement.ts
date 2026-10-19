import { ShipNavigation } from './ShipNavigation.js';
import type { NavigationReading } from './ShipNavigation.js';
import { ShipInternals } from './ShipInternals.js';
import type { InternalsReading } from './ShipInternals.js';
import { ShipMounts } from './ShipMounts.js';
import type { MountsReading } from './ShipMounts.js';
import { ShipCargo } from './ShipCargo.js';
import type { CargoReading } from './ShipCargo.js';
import { ShipShields } from './ShipShields.js';
import type { ShieldReading } from './ShipShields.js';
import { ShipHull } from './ShipHull.js';
import type { HullReading } from './ShipHull.js';
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
  readonly navigation: Readonly<NavigationReading>;
  readonly internals: Readonly<InternalsReading>;
  readonly mounts: Readonly<MountsReading>;
  readonly cargo: Readonly<CargoReading>;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly body: Readonly<BodyReading>;
  readonly power: Readonly<PowerReading>;
  readonly engine: Readonly<EngineReading>;
  readonly dampers: Readonly<DamperReading>;
  readonly cooling: Readonly<CoolingReading>;
  readonly shields: Readonly<ShieldReading>;
  readonly hull: Readonly<HullReading>;
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
    private readonly shields: ShipShields,
    private readonly hull: ShipHull,
    private readonly cargo: ShipCargo,
    private readonly mounts: ShipMounts,
    private readonly internals: ShipInternals,
    private readonly navigation: ShipNavigation,
  ) {
    this.requires = [
      control,
      engine,
      power,
      body,
      dampers,
      cooling,
      shields,
      hull,
      cargo,
      mounts,
      internals,
      navigation,
    ];
    this.#telemetry = Object.freeze({
      navigation: navigation.telemetry,
      tick: 0,
      timeSeconds: 0,
      body: body.telemetry,
      power: power.telemetry,
      engine: engine.telemetry,
      dampers: dampers.telemetry,
      cooling: cooling.telemetry,
      shields: shields.telemetry,
      hull: hull.telemetry,
      cargo: cargo.telemetry,
      mounts: mounts.telemetry,
      internals: internals.telemetry,
      shipG: 0,
      crewG: 0,
      worldForceN: Object.freeze({ x: 0, y: 0, z: 0 }),
    });
  }
  fixedUpdate(dt: number): undefined {
    numberIn('ship fixed step', dt, 1e-6, 1);
    this.mounts.commit();
    this.internals.commit();
    this.power.beginStep();
    this.shields.beginStep();
    this.shields.transfer(dt);
    const requestedEngine = this.engine.declare(this.control.intent);
    this.dampers.declare(this.control.intent, requestedEngine, dt);
    this.cargo.declare();
    this.mounts.declare();
    this.internals.declare();
    this.cooling.declare();
    this.shields.declare(dt);
    this.power.allocate(dt);
    this.shields.deliver(dt);
    this.cargo.deliver();
    this.mounts.deliver(dt);
    this.internals.deliver(dt);
    this.hull.resolve();
    const delivered = this.engine.deliver();
    const damperReading = this.dampers.deliver(delivered.activityFraction);
    this.power.generateHeat(dt);
    this.engine.generateHeat(dt);
    this.dampers.generateHeat(dt);
    this.shields.generateHeat(dt);
    this.cargo.generateHeat(dt);
    const coolingReading = this.cooling.deliver(dt);
    this.power.finishThermalStep(dt);
    this.engine.finishThermalStep(dt);
    this.dampers.finishThermalStep(dt);
    this.shields.finishThermalStep(dt);
    this.cargo.finishStep(dt);
    this.mounts.finishStep(dt);
    this.internals.finishStep(dt);
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
    this.navigation.commit();
    this.#telemetry = Object.freeze({
      navigation: this.navigation.telemetry,
      tick: this.#telemetry.tick + 1,
      timeSeconds: this.#telemetry.timeSeconds + dt,
      body: this.body.telemetry,
      power: this.power.telemetry,
      engine: this.engine.telemetry,
      cooling: coolingReading,
      dampers: this.dampers.telemetry,
      shields: this.shields.telemetry,
      hull: this.hull.telemetry,
      cargo: this.cargo.telemetry,
      mounts: this.mounts.telemetry,
      internals: this.internals.telemetry,
      shipG,
      crewG: shipG * damperReading.transmittedFraction,
      worldForceN,
    });
  }
  get telemetry(): Readonly<ShipTelemetry> {
    return this.#telemetry;
  }
}
