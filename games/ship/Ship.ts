import { Node2D } from '../../src/index.js';
import { ShipBody } from './ShipBody.js';
import { ShipControl } from './ShipControl.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import { ShipEngine } from './ShipEngine.js';
import { ShipDampers } from './ShipDampers.js';
import { ShipCooling } from './ShipCooling.js';
import { ShipShields } from './ShipShields.js';
import { ShipHull } from './ShipHull.js';
import { ShipMovement } from './ShipMovement.js';

import {
  numberIn,
  profileId,
  validateInitialState,
  validateThermalInstallation,
} from './ShipProfiles.js';
import type { ShipProfile, ShipInitialState } from './ShipProfiles.js';

/** Established typed attachment host; its 2D visual transforms are unused. */
export class Ship extends Node2D {
  readonly definitionId: string;
  readonly body: ShipBody;
  readonly control: ShipControl;
  readonly power: ShipPowerPlant;
  readonly engine: ShipEngine;
  readonly dampers: ShipDampers;
  readonly cooling: ShipCooling;
  readonly shields: ShipShields;
  readonly hull: ShipHull;
  readonly movement: ShipMovement;
  constructor(
    profile: Readonly<ShipProfile>,
    initialState: Readonly<ShipInitialState>,
  ) {
    super();
    this.definitionId = profileId(profile.id, 'Ship id');
    const initial = validateInitialState(
      initialState,
      profile.power.capacityJ,
      profile.engine.health.maxPoints,
      profile.power.health.maxPoints,
    );
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
    numberIn(
      'Cooling restartEnergyJ for installed reserve',
      profile.cooling.restartEnergyJ,
      0,
      profile.power.capacityJ,
    );
    numberIn(
      'Shield restartEnergyJ for installed reserve',
      profile.shields.restartEnergyJ,
      0,
      profile.power.capacityJ,
    );
    validateThermalInstallation(profile.cooling, profile.power.thermal);
    validateThermalInstallation(profile.cooling, profile.engine.thermal);
    validateThermalInstallation(profile.cooling, profile.dampers.thermal);
    validateThermalInstallation(profile.cooling, profile.shields.thermal);
    try {
      this.body = this.attach(new ShipBody(profile.body, initial.velocityMps));
      this.control = this.attach(new ShipControl());
      this.power = this.attach(
        new ShipPowerPlant(
          profile.power,
          initial.energyJ,
          initial.reactorTemperatureK,
          initial.reactorHealthPoints,
        ),
      );
      this.engine = this.attach(
        new ShipEngine(
          profile.engine,
          this.power,
          initial.engineTemperatureK,
          initial.engineHealthPoints,
        ),
      );
      this.dampers = this.attach(
        new ShipDampers(
          profile.dampers,
          this.power,
          this.body,
          initial.damperTemperatureK,
        ),
      );
      this.shields = this.attach(
        new ShipShields(
          profile.shields,
          this.power,
          initial.shieldTemperatureK,
        ),
      );
      this.cooling = this.attach(
        new ShipCooling(
          profile.cooling,
          this.power,
          this.engine,
          this.dampers,
          this.shields,
        ),
      );
      this.hull = this.attach(new ShipHull(profile.hull, this.shields));
      this.movement = this.attach(
        new ShipMovement(
          this.control,
          this.engine,
          this.power,
          this.body,
          this.dampers,
          this.cooling,
          this.shields,
          this.hull,
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
