import { Simulation } from 'production-workshop';
import { ShipInternals } from './ShipInternals.js';
import { ShipMounts } from './ShipMounts.js';
import { CargoLink } from './CargoLink.js';
import { ShipCargo } from './ShipCargo.js';
import { Node2D } from '../../src/index.js';
import { ShipNavigation } from './ShipNavigation.js';
import type { NavigationContact } from './ShipNavigation.js';
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
  readonly mounts: ShipMounts;
  readonly internals: ShipInternals;
  readonly production: Simulation;
  readonly cargoLink: CargoLink;
  readonly cargo: ShipCargo;
  readonly body: ShipBody;
  readonly navigation: ShipNavigation;
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
    contacts: readonly NavigationContact[] = [],
  ) {
    super();
    this.definitionId = profileId(profile.id, 'Ship id');
    const initial = validateInitialState(
      initialState,
      profile.power.capacityJ,
      profile.engine.health.maxPoints,
      profile.power.health.maxPoints,
      profile.cooling.health.maxPoints,
      profile.dampers.health.maxPoints,
      profile.shields.health.maxPoints,
      profile.cargo.health.maxPoints,
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
    numberIn(
      'Cargo restartEnergyJ for installed reserve',
      profile.cargo.restartEnergyJ,
      0,
      profile.power.capacityJ,
    );
    validateThermalInstallation(profile.cooling, profile.cargo.thermal);
    for (const e of profile.mounts.equipment)
      validateThermalInstallation(profile.cooling, e.thermal);
    for (const d of profile.internals.definitions)
      validateThermalInstallation(profile.cooling, d.thermal);
    this.production = new Simulation(profile.production);
    this.cargoLink = new CargoLink(initial.cargoPocketId);
    try {
      this.body = this.attach(new ShipBody(profile.body, initial.velocityMps));
      this.navigation = this.attach(new ShipNavigation(this.body, contacts));
      this.control = this.attach(new ShipControl());
      this.power = this.attach(
        new ShipPowerPlant(
          profile.power,
          initial.energyJ,
          initial.reactorTemperatureK,
          initial.reactorHealthPoints,
        ),
      );
      this.mounts = this.attach(new ShipMounts(profile.mounts, this.power));
      this.internals = this.attach(
        new ShipInternals(profile.internals, this.power, this.production),
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
          initial.damperHealthPoints,
        ),
      );
      this.shields = this.attach(
        new ShipShields(
          profile.shields,
          this.power,
          initial.shieldTemperatureK,
          initial.shieldHealthPoints,
        ),
      );
      this.cargo = this.attach(
        new ShipCargo(
          profile.cargo,
          this.power,
          this.cargoLink,
          initial.cargoTemperatureK,
          initial.cargoHealthPoints,
        ),
      );
      this.cooling = this.attach(
        new ShipCooling(
          profile.cooling,
          this.power,
          this.engine,
          this.dampers,
          this.shields,
          this.cargo,
          this.mounts,
          this.internals,
          initial.coolingHealthPoints,
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
          this.cargo,
          this.mounts,
          this.internals,
          this.navigation,
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
