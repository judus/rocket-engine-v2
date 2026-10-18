import { Node2D } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { ShipBody } from './ShipBody.js';
import type { BodyProfile } from './ShipBody.js';
import { ShipControl } from './ShipControl.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPlantProfile } from './ShipPowerPlant.js';
import { ShipEngine } from './ShipEngine.js';
import type { EngineProfile } from './ShipEngine.js';
import { ShipMovement } from './ShipMovement.js';

export interface ShipProfile {
  body: Readonly<BodyProfile>;
  power: Readonly<PowerPlantProfile>;
  engine: Readonly<EngineProfile>;
}
/** Deliberately short depletion/recovery cycle, not final flight balance. */
export const starterShip: Readonly<ShipProfile> = Object.freeze({
  body: Object.freeze({ massKg: 100_000, yawInertiaKgM2: 20_000_000 }),
  power: Object.freeze({
    capacityJ: 200e9,
    initialEnergyJ: 100e9,
    reactorOutputW: 5e9,
  }),
  engine: Object.freeze({
    maxThrustN: 1e6,
    maxYawTorqueNm: 1e7,
    baselineW: 10e6,
    fullThrustW: 20e9,
    fullYawW: 1e9,
    restartEnergyJ: 20e9,
  }),
});
/** Established typed attachment host; its 2D visual transforms are unused. */
export class Ship extends Node2D {
  readonly body: ShipBody;
  readonly control: ShipControl;
  readonly power: ShipPowerPlant;
  readonly engine: ShipEngine;
  readonly movement: ShipMovement;
  constructor(
    profile: Readonly<ShipProfile> = starterShip,
    initialVelocity?: Readonly<Vec3>,
  ) {
    super();
    try {
      this.body = this.attach(new ShipBody(profile.body, initialVelocity));
      this.control = this.attach(new ShipControl());
      this.power = this.attach(new ShipPowerPlant(profile.power));
      this.engine = this.attach(new ShipEngine(profile.engine, this.power));
      this.movement = this.attach(
        new ShipMovement(this.control, this.engine, this.power, this.body),
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  get telemetry() {
    return this.movement.telemetry;
  }
}
