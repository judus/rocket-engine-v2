import { propulsionDelivery } from './PropulsionDelivery.js';
import type { PropulsionDelivery } from './PropulsionDelivery.js';
import { ModuleHealth } from './ModuleHealth.js';
import type { HealthReading } from './ModuleHealth.js';
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

export interface EngineReading extends PropulsionDelivery {
  readonly requested: boolean;
  readonly state:
    | 'failed'
    | 'damaged'
    | 'off'
    | 'online'
    | 'limited'
    | 'waiting-for-charge'
    | 'overheated'
    | 'restarting';
  readonly health: Readonly<HealthReading>;
  readonly powerFraction: number;
  readonly thermal: Readonly<ThermalReading>;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly thrustN: Readonly<Vec3>;
  readonly yawTorqueNm: number;
  readonly pitchTorqueNm: number;
  readonly rollTorqueNm: number;
}
export class ShipEngine implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<EngineProfile>;
  #power: ShipPowerPlant;
  #port: PowerPort | undefined;
  #requested = true;
  #intent: Readonly<ShipIntent> = {
    thrust: zeroVector(),
    yaw: 0,
    pitch: 0,
    roll: 0,
  };
  #translationDemandW = 0;
  #rotationDemandW = 0;
  #health: ModuleHealth;
  #thermal: ModuleThermal;
  #operating = false;
  #powerRequested = false;
  #reading: Readonly<EngineReading>;
  constructor(
    profile: EngineProfile,
    power: ShipPowerPlant,
    initialTemperatureK: number,
    initialHealthPoints: number,
  ) {
    this.profile = validateEngineProfile(profile);
    this.#health = new ModuleHealth(this.profile.health, initialHealthPoints);
    this.#power = power;
    this.requires = [power];
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
    this.#reading = Object.freeze({
      ...propulsionDelivery(0, this.profile.baselineW, 0, 0, false, 0),
      requested: true,
      state: this.#health.telemetry.failed
        ? 'failed'
        : (this.#thermal.state(true) ?? 'off'),
      health: this.#health.telemetry,
      powerFraction: 0,
      thermal: this.#thermal.telemetry,
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      thrustN: Object.freeze(zeroVector()),
      yawTorqueNm: 0,
      pitchTorqueNm: 0,
      rollTorqueNm: 0,
    });
  }
  get temperatureK(): number {
    return this.#thermal.temperatureK;
  }
  heatAbove(sinkTemperatureK: number): number {
    return this.#thermal.heatAbove(sinkTemperatureK);
  }
  onAttach(): undefined {
    this.#port = this.#power.connect(
      this.profile.restartEnergyJ,
      'nonessential',
    );
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Engine is not attached');
    return this.#port;
  }
  damage(points: number): void {
    this.port();
    this.#health.damage(points);
  }
  repair(points: number): void {
    this.port();
    this.#health.repair(points);
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Engine request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
  }
  declare(
    intent: Readonly<ShipIntent>,
  ): Pick<
    EngineReading,
    'thrustN' | 'yawTorqueNm' | 'pitchTorqueNm' | 'rollTorqueNm' | 'requested'
  > {
    this.#intent = intent;
    const wasFailed = this.#health.telemetry.failed;
    this.#health.commit();
    const failed = this.#health.telemetry.failed;
    if (wasFailed && !failed)
      this.#thermal.requestChanged(false, this.#requested);
    const thermal = this.#thermal.begin(this.#requested && !failed);
    this.#operating = thermal.operating;
    this.#powerRequested = thermal.powerRequested;
    const throttle = Math.hypot(
      intent.thrust.x,
      intent.thrust.y,
      intent.thrust.z,
    );
    this.#translationDemandW = this.#operating
      ? this.profile.fullThrustW * throttle
      : 0;
    this.#rotationDemandW = this.#operating
      ? this.profile.fullYawW * Math.abs(intent.yaw) +
        this.profile.fullPitchW * Math.abs(intent.pitch) +
        this.profile.fullRollW * Math.abs(intent.roll)
      : 0;
    this.port().request(
      this.#powerRequested,
      this.profile.baselineW + this.#translationDemandW + this.#rotationDemandW,
    );
    // Nominal preview: dampers apply the final funded/condition fraction once.
    return {
      requested: this.#operating,
      thrustN: {
        x: intent.thrust.x * this.profile.maxThrustN * Number(this.#operating),
        y: intent.thrust.y * this.profile.maxThrustN * Number(this.#operating),
        z: intent.thrust.z * this.profile.maxThrustN * Number(this.#operating),
      },
      yawTorqueNm:
        intent.yaw * this.profile.maxYawTorqueNm * Number(this.#operating),
      pitchTorqueNm:
        intent.pitch * this.profile.maxPitchTorqueNm * Number(this.#operating),
      rollTorqueNm:
        intent.roll * this.profile.maxRollTorqueNm * Number(this.#operating),
    };
  }
  deliver(): Readonly<EngineReading> {
    const allocation = this.port().delivery();
    const health = this.#health.telemetry;
    const channels = propulsionDelivery(
      allocation.suppliedW,
      this.profile.baselineW,
      this.#translationDemandW,
      this.#rotationDemandW,
      this.#operating,
      health.outputFraction,
    );
    const powerFraction = channels.powerFraction;
    const thrustN = Object.freeze({
      x:
        this.#intent.thrust.x *
        this.profile.maxThrustN *
        channels.translationActivityFraction,
      y:
        this.#intent.thrust.y *
        this.profile.maxThrustN *
        channels.translationActivityFraction,
      z:
        this.#intent.thrust.z *
        this.profile.maxThrustN *
        channels.translationActivityFraction,
    });
    this.#reading = Object.freeze({
      ...channels,
      requested: this.#requested,
      state: health.failed
        ? 'failed'
        : (this.#thermal.state(this.#requested) ??
          (allocation.suppliedW === 0
            ? 'waiting-for-charge'
            : powerFraction < 1
              ? 'limited'
              : health.fraction < 1
                ? 'damaged'
                : 'online')),
      health,
      powerFraction,
      thermal: this.#thermal.telemetry,
      demandW: this.#powerRequested
        ? this.profile.baselineW +
          this.#translationDemandW +
          this.#rotationDemandW
        : 0,
      suppliedW: allocation.suppliedW,
      thrustN,
      yawTorqueNm:
        this.#intent.yaw *
        this.profile.maxYawTorqueNm *
        channels.rotationActivityFraction,
      pitchTorqueNm:
        this.#intent.pitch *
        this.profile.maxPitchTorqueNm *
        channels.rotationActivityFraction,
      rollTorqueNm:
        this.#intent.roll *
        this.profile.maxRollTorqueNm *
        channels.rotationActivityFraction,
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
      state: this.#health.telemetry.failed
        ? 'failed'
        : (thermalState ??
          (startupCompleted
            ? this.#health.telemetry.fraction < 1
              ? 'damaged'
              : 'online'
            : this.#reading.state)),
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
