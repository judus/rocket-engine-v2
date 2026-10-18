import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import type { ShipIntent } from './ShipControl.js';
import { zeroVector } from './ShipBody.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import { numberIn, validateEngineProfile } from './ShipProfiles.js';
import type { EngineProfile } from './ShipProfiles.js';
import type { PowerPort } from './ShipPowerPlant.js';

export interface EngineReading {
  readonly requested: boolean;
  readonly state:
    | 'off'
    | 'online'
    | 'limited'
    | 'waiting-for-charge'
    | 'overheated'
    | 'restarting';
  readonly thermal: Readonly<EngineThermalReading>;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly thrustN: Readonly<Vec3>;
  readonly yawTorqueNm: number;
}
export interface EngineThermalReading {
  readonly temperatureK: number;
  readonly generatedHeatW: number;
  readonly removedHeatW: number;
  readonly tripped: boolean;
  readonly restartRemainingSeconds: number;
}
export class ShipEngine implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<EngineProfile>;
  #power: ShipPowerPlant;
  #port: PowerPort | undefined;
  #requested = true;
  #intent: Readonly<ShipIntent> = { thrust: zeroVector(), yaw: 0 };
  #activityDemandW = 0;
  #temperatureK: number;
  #tripped = false;
  #restartRemaining = 0;
  #operating = false;
  #powerRequested = false;
  #starting = false;
  #tripThisStep = false;
  #generatedHeatW = 0;
  #removedHeatJ = 0;
  #reading: Readonly<EngineReading>;
  constructor(
    profile: EngineProfile,
    power: ShipPowerPlant,
    initialTemperatureK: number,
  ) {
    this.profile = validateEngineProfile(profile);
    this.#power = power;
    this.requires = [power];
    this.#temperatureK = numberIn(
      'initial engine temperature',
      initialTemperatureK,
      0,
      1e6,
    );
    if (this.#temperatureK >= this.profile.thermal.tripTemperatureK) {
      this.#tripThisStep = true;
      this.#tripped = true;
      this.#restartRemaining = this.profile.thermal.rebootSeconds;
    }
    this.#reading = Object.freeze({
      requested: true,
      state: this.#tripped ? 'overheated' : 'off',
      thermal: this.thermalReading(),
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      thrustN: Object.freeze(zeroVector()),
      yawTorqueNm: 0,
    });
  }
  private thermalReading(): Readonly<EngineThermalReading> {
    return Object.freeze({
      temperatureK: this.#temperatureK,
      generatedHeatW: this.#generatedHeatW,
      removedHeatW: 0,
      tripped: this.#tripped,
      restartRemainingSeconds: this.#restartRemaining,
    });
  }
  get temperatureK(): number {
    return this.#temperatureK;
  }
  onAttach(): undefined {
    this.#port = this.#power.connect(this.profile.restartEnergyJ);
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Engine is not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Engine request must be boolean');
    if (value && !this.#requested && !this.#tripped)
      this.#restartRemaining = this.profile.thermal.manualStartSeconds;
    this.#requested = value;
  }
  declare(
    intent: Readonly<ShipIntent>,
  ): Pick<EngineReading, 'thrustN' | 'yawTorqueNm' | 'requested'> {
    this.#intent = intent;
    this.#tripThisStep = false;
    this.#generatedHeatW = 0;
    this.#removedHeatJ = 0;
    this.#starting = this.#restartRemaining > 0;
    this.#operating = this.#requested && !this.#tripped && !this.#starting;
    this.#powerRequested =
      this.#requested &&
      (!this.#tripped ||
        this.#temperatureK <= this.profile.thermal.restartTemperatureK);
    const throttle = Math.hypot(
      intent.thrust.x,
      intent.thrust.y,
      intent.thrust.z,
    );
    this.#activityDemandW = this.#operating
      ? this.profile.fullThrustW * throttle +
        this.profile.fullYawW * Math.abs(intent.yaw)
      : 0;
    this.port().request(
      this.#powerRequested,
      this.profile.baselineW + this.#activityDemandW,
    );
    return {
      requested: this.#operating,
      thrustN: {
        x: intent.thrust.x * this.profile.maxThrustN * Number(this.#operating),
        y: intent.thrust.y * this.profile.maxThrustN * Number(this.#operating),
        z: intent.thrust.z * this.profile.maxThrustN * Number(this.#operating),
      },
      yawTorqueNm:
        intent.yaw * this.profile.maxYawTorqueNm * Number(this.#operating),
    };
  }
  deliver(): Readonly<EngineReading> {
    const allocation = this.port().delivery();
    const activeW = Math.max(0, allocation.suppliedW - this.profile.baselineW);
    const fraction =
      this.#operating && allocation.suppliedW >= this.profile.baselineW
        ? this.#activityDemandW > 0
          ? Math.min(1, activeW / this.#activityDemandW)
          : 1
        : 0;
    const thrustN = Object.freeze({
      x: this.#intent.thrust.x * this.profile.maxThrustN * fraction,
      y: this.#intent.thrust.y * this.profile.maxThrustN * fraction,
      z: this.#intent.thrust.z * this.profile.maxThrustN * fraction,
    });
    this.#reading = Object.freeze({
      requested: this.#requested,
      state: !this.#requested
        ? 'off'
        : this.#tripped
          ? 'overheated'
          : this.#starting
            ? 'restarting'
            : allocation.suppliedW === 0
              ? 'waiting-for-charge'
              : fraction < 1
                ? 'limited'
                : 'online',
      thermal: this.thermalReading(),
      demandW: this.#powerRequested
        ? this.profile.baselineW + this.#activityDemandW
        : 0,
      suppliedW: allocation.suppliedW,
      activityFraction: fraction,
      thrustN,
      yawTorqueNm: this.#intent.yaw * this.profile.maxYawTorqueNm * fraction,
    });
    return this.#reading;
  }
  /** Heat follows actual supplied electrical energy, including standby/restart losses. */
  generateHeat(dt: number): void {
    this.#generatedHeatW =
      this.#reading.suppliedW * this.profile.thermal.wasteHeatFraction;
    this.#temperatureK +=
      (this.#generatedHeatW * dt) / this.profile.thermal.heatCapacityJPerK;
    if (this.#temperatureK >= this.profile.thermal.tripTemperatureK) {
      this.#tripThisStep = true;
      this.#tripped = true;
      this.#restartRemaining = this.profile.thermal.rebootSeconds;
    }
  }
  /** The cooling component transfers heat; the engine remains its temperature owner. */
  removeHeat(maxEnergyJ: number, sinkTemperatureK: number): number {
    numberIn('Cooling energy', maxEnergyJ, 0);
    numberIn('Cooling sink temperature', sinkTemperatureK, 0, 1e6);
    const removed = Math.min(
      maxEnergyJ,
      Math.max(0, this.#temperatureK - sinkTemperatureK) *
        this.profile.thermal.heatCapacityJPerK,
    );
    this.#temperatureK -= removed / this.profile.thermal.heatCapacityJPerK;
    this.#removedHeatJ += removed;
    return removed;
  }
  finishThermalStep(dt: number): void {
    const coolEnough =
      !this.#tripped ||
      this.#temperatureK <= this.profile.thermal.restartTemperatureK;
    if (
      this.#requested &&
      this.#starting &&
      !this.#tripThisStep &&
      this.#powerRequested &&
      coolEnough
    ) {
      const funded = Math.min(
        1,
        this.#reading.suppliedW / this.profile.baselineW,
      );
      this.#restartRemaining = Math.max(
        0,
        this.#restartRemaining - dt * funded,
      );
      if (this.#restartRemaining < 1e-9) {
        this.#restartRemaining = 0;
        this.#tripped = false;
      }
    }
    this.#reading = Object.freeze({
      ...this.#reading,
      state: !this.#requested
        ? 'off'
        : this.#tripped &&
            this.#temperatureK > this.profile.thermal.restartTemperatureK
          ? 'overheated'
          : this.#restartRemaining > 0
            ? 'restarting'
            : this.#starting && this.#restartRemaining === 0
              ? 'online'
              : this.#reading.state,
      thermal: Object.freeze({
        ...this.thermalReading(),
        removedHeatW: this.#removedHeatJ / dt,
      }),
    });
  }
  get telemetry(): Readonly<EngineReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
  }
}
