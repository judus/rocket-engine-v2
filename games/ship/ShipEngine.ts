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
  readonly state: 'off' | 'online' | 'limited' | 'waiting-for-charge';
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
  #reading: Readonly<EngineReading> = Object.freeze({
    requested: true,
    state: 'off',
    demandW: 0,
    suppliedW: 0,
    activityFraction: 0,
    thrustN: Object.freeze(zeroVector()),
    yawTorqueNm: 0,
  });
  constructor(profile: EngineProfile, power: ShipPowerPlant) {
    this.profile = validateEngineProfile(profile);
    this.#power = power;
    this.requires = [power];
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
    this.#requested = value;
  }
  declare(intent: Readonly<ShipIntent>): void {
    this.#intent = intent;
    const throttle = Math.hypot(
      intent.thrust.x,
      intent.thrust.y,
      intent.thrust.z,
    );
    this.#activityDemandW =
      this.profile.fullThrustW * throttle +
      this.profile.fullYawW * Math.abs(intent.yaw);
    this.port().request(
      this.#requested,
      this.profile.baselineW + this.#activityDemandW,
    );
  }
  deliver(): Readonly<EngineReading> {
    const allocation = this.port().delivery();
    const activeW = Math.max(0, allocation.suppliedW - this.profile.baselineW);
    const fraction =
      this.#requested && allocation.suppliedW >= this.profile.baselineW
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
        : allocation.suppliedW === 0
          ? 'waiting-for-charge'
          : fraction < 1
            ? 'limited'
            : 'online',
      demandW: this.#requested
        ? this.profile.baselineW + this.#activityDemandW
        : 0,
      suppliedW: allocation.suppliedW,
      activityFraction: fraction,
      thrustN,
      yawTorqueNm: this.#intent.yaw * this.profile.maxYawTorqueNm * fraction,
    });
    return this.#reading;
  }
  get telemetry(): Readonly<EngineReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
  }
}
