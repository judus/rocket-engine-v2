import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import type { ShipIntent } from './ShipControl.js';
import { zeroVector } from './ShipBody.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import { validateEngineProfile } from './ShipProfiles.js';
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
  readonly thermal: Readonly<ThermalReading>;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly thrustN: Readonly<Vec3>;
  readonly yawTorqueNm: number;
}
export class ShipEngine implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<EngineProfile>;
  #power: ShipPowerPlant;
  #port: PowerPort | undefined;
  #requested = true;
  #intent: Readonly<ShipIntent> = { thrust: zeroVector(), yaw: 0 };
  #activityDemandW = 0;
  #thermal: ModuleThermal;
  #operating = false;
  #powerRequested = false;
  #reading: Readonly<EngineReading>;
  constructor(
    profile: EngineProfile,
    power: ShipPowerPlant,
    initialTemperatureK: number,
  ) {
    this.profile = validateEngineProfile(profile);
    this.#power = power;
    this.requires = [power];
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
    this.#reading = Object.freeze({
      requested: true,
      state: this.#thermal.state(true) ?? 'off',
      thermal: this.#thermal.telemetry,
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      thrustN: Object.freeze(zeroVector()),
      yawTorqueNm: 0,
    });
  }
  get temperatureK(): number {
    return this.#thermal.temperatureK;
  }
  heatAbove(sinkTemperatureK: number): number {
    return this.#thermal.heatAbove(sinkTemperatureK);
  }
  onAttach(): undefined {
    this.#port = this.#power.connect(this.profile.restartEnergyJ, 'propulsion');
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Engine is not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Engine request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
  }
  declare(
    intent: Readonly<ShipIntent>,
  ): Pick<EngineReading, 'thrustN' | 'yawTorqueNm' | 'requested'> {
    this.#intent = intent;
    const thermal = this.#thermal.begin(this.#requested);
    this.#operating = thermal.operating;
    this.#powerRequested = thermal.powerRequested;
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
      state:
        this.#thermal.state(this.#requested) ??
        (allocation.suppliedW === 0
          ? 'waiting-for-charge'
          : fraction < 1
            ? 'limited'
            : 'online'),
      thermal: this.#thermal.telemetry,
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
  generateHeat(dt: number): void {
    this.#thermal.generate(this.#reading.suppliedW, dt);
  }
  removeHeat(maxEnergyJ: number, sinkTemperatureK: number): number {
    return this.#thermal.removeHeat(maxEnergyJ, sinkTemperatureK);
  }
  finishThermalStep(dt: number): void {
    this.#thermal.finish(
      dt,
      this.#requested,
      Math.min(1, this.#reading.suppliedW / this.profile.baselineW),
    );
    const thermalState = this.#thermal.state(this.#requested);
    const startupCompleted =
      this.#reading.state === 'restarting' && thermalState === undefined;
    this.#reading = Object.freeze({
      ...this.#reading,
      state:
        thermalState ?? (startupCompleted ? 'online' : this.#reading.state),
      thermal: this.#thermal.telemetry,
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
