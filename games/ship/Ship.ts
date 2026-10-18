import { Node2D } from '../../src/index.js';
import { ShipBody } from './ShipBody.js';
import { ShipControl } from './ShipControl.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import { ShipEngine } from './ShipEngine.js';
import { ShipDampers } from './ShipDampers.js';
import { ShipMovement } from './ShipMovement.js';

import { numberIn, profileId, validateInitialState } from './ShipProfiles.js';
import type { ShipProfile, ShipInitialState } from './ShipProfiles.js';

/** Established typed attachment host; its 2D visual transforms are unused. */
export class Ship extends Node2D {
  readonly definitionId: string;
  readonly body: ShipBody;
  readonly control: ShipControl;
  readonly power: ShipPowerPlant;
  readonly engine: ShipEngine;
  readonly dampers: ShipDampers;
  readonly movement: ShipMovement;
  constructor(
    profile: Readonly<ShipProfile>,
    initialState: Readonly<ShipInitialState>,
  ) {
    super();
    this.definitionId = profileId(profile.id, 'Ship id');
    const initial = validateInitialState(initialState, profile.power.capacityJ);
    numberIn(
      'Engine restartEnergyJ for installed reserve',
      profile.engine.restartEnergyJ,
      0,
      profile.power.capacityJ,
    );
    numberIn(
      'Damper restartEnergyJ for installed reserve',
      profile.dampers.restartEnergyJ,
      0,
      profile.power.capacityJ,
    );
    try {
      this.body = this.attach(new ShipBody(profile.body, initial.velocityMps));
      this.control = this.attach(new ShipControl());
      this.power = this.attach(
        new ShipPowerPlant(profile.power, initial.energyJ),
      );
      this.engine = this.attach(new ShipEngine(profile.engine, this.power));
      this.dampers = this.attach(
        new ShipDampers(profile.dampers, this.power, this.body),
      );
      this.movement = this.attach(
        new ShipMovement(
          this.control,
          this.engine,
          this.power,
          this.body,
          this.dampers,
        ),
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
