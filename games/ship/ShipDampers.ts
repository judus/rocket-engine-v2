import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { CapturePlan } from './CaptureResponse.js';
import { ShipBody, zeroVector } from './ShipBody.js';
import type { ShipIntent } from './ShipControl.js';
import type { EngineReading } from './ShipEngine.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { validateDamperProfile } from './ShipProfiles.js';
import type { DamperProfile } from './ShipProfiles.js';

export interface DamperReading {
  readonly requested: boolean;
  readonly state:
    | 'off'
    | 'online'
    | 'limited'
    | 'waiting-for-charge'
    | 'overheated'
    | 'restarting';
  readonly thermal: Readonly<ThermalReading>;
  readonly mode: 'coast' | 'assisted' | 'capture';
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly worldForceN: Readonly<Vec3>;
  readonly yawTorqueNm: number;
  readonly captureDurationSeconds: number;
  readonly captureElapsedSeconds: number;
  readonly transmittedFraction: number;
}
/** Powered velocity servo and protection; never writes body state or reserve. */
export class ShipDampers implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<DamperProfile>;
  #port: PowerPort | undefined;
  #requested = false;
  #capture: CapturePlan | undefined;
  #captureDirection = zeroVector();
  #captureElapsed = 0;
  #engagement = true;
  #force = zeroVector();
  #drive = zeroVector();
  #driveTorque = 0;
  #torque = 0;
  #activityW = 0;
  #dt = 0;
  #thermal: ModuleThermal;
  #operating = false;
  #powerRequested = false;
  #reading: Readonly<DamperReading>;
  constructor(
    profile: DamperProfile,
    private readonly power: ShipPowerPlant,
    private readonly body: ShipBody,
    initialTemperatureK: number,
  ) {
    this.profile = validateDamperProfile(profile);
    this.requires = [power, body];
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
    this.#reading = Object.freeze({
      requested: false,
      state: this.#thermal.state(false) ?? 'off',
      thermal: this.#thermal.telemetry,
      mode: 'coast',
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      worldForceN: Object.freeze(zeroVector()),
      yawTorqueNm: 0,
      captureDurationSeconds: 0,
      captureElapsedSeconds: 0,
      transmittedFraction: 1,
    });
  }
  onAttach(): undefined {
    this.#port = this.power.connect(
      this.profile.restartEnergyJ,
      'nonessential',
    );
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Dampers are not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Damper request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    if (value !== this.#requested) {
      this.#engagement = true;
      this.#capture = undefined;
      this.#captureElapsed = 0;
    }
    this.#requested = value;
  }
  declare(
    intent: Readonly<ShipIntent>,
    engine: Pick<EngineReading, 'thrustN' | 'yawTorqueNm' | 'requested'>,
    dt: number,
  ): void {
    this.#dt = dt;
    const thermal = this.#thermal.begin(this.#requested);
    this.#operating = thermal.operating;
    this.#powerRequested = thermal.powerRequested;
    const body = this.body.telemetry;
    const v = body.velocityMps;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (this.#operating && this.#engagement) {
      this.#engagement = false;
      this.#captureElapsed = 0;
      this.#capture =
        speed > this.profile.capture.assistedSpeedMps
          ? new CapturePlan(this.profile.capture, speed)
          : undefined;
      if (this.#capture)
        this.#captureDirection = {
          x: v.x / speed,
          y: v.y / speed,
          z: v.z / speed,
        };
    }
    const engineForce = this.body.localToWorld(engine.thrustN);
    let desiredChange: Vec3;
    let driveChange = zeroVector();
    if (this.#capture) {
      // Sample the immutable engagement plan; power loss never snaps actual velocity to it.
      const next = this.#capture.at(
        Math.min(this.#capture.durationSeconds, this.#captureElapsed + dt),
      );
      desiredChange = {
        x: this.#captureDirection.x * next.speedMps - v.x,
        y: this.#captureDirection.y * next.speedMps - v.y,
        z: this.#captureDirection.z * next.speedMps - v.z,
      };
    } else {
      const target = this.body.localToWorld({
        x: intent.thrust.x * this.profile.capture.assistedSpeedMps,
        y: intent.thrust.y * this.profile.capture.assistedSpeedMps,
        z: intent.thrust.z * this.profile.capture.assistedSpeedMps,
      });
      // 95% of a command change in responseSeconds; stable at every allowed fixed step.
      const gain = -Math.expm1((-3 * dt) / this.profile.responseSeconds);
      desiredChange = { x: -v.x * gain, y: -v.y * gain, z: -v.z * gain };
      if (engine.requested)
        driveChange = {
          x: target.x * gain,
          y: target.y * gain,
          z: target.z * gain,
        };
    }
    this.#force = {
      x: (this.body.massKg * desiredChange.x) / dt,
      y: (this.body.massKg * desiredChange.y) / dt,
      z: (this.body.massKg * desiredChange.z) / dt,
    };
    this.#drive = {
      x: (this.body.massKg * driveChange.x) / dt - engineForce.x,
      y: (this.body.massKg * driveChange.y) / dt - engineForce.y,
      z: (this.body.massKg * driveChange.z) / dt - engineForce.z,
    };
    const yawGain = -Math.expm1((-3 * dt) / this.profile.responseSeconds);
    this.#torque =
      (-this.body.yawInertiaKgM2 * body.yawRateRadps * yawGain) / dt;
    this.#driveTorque =
      (this.body.yawInertiaKgM2 *
        Number(engine.requested) *
        intent.yaw *
        this.profile.maxYawRateRadps *
        yawGain) /
        dt -
      engine.yawTorqueNm;
    this.#activityW = this.#operating
      ? (Math.hypot(this.#force.x, this.#force.y, this.#force.z) +
          Math.hypot(this.#drive.x, this.#drive.y, this.#drive.z)) *
          this.profile.wattsPerNewton +
        (Math.abs(this.#torque) + Math.abs(this.#driveTorque)) *
          this.profile.wattsPerNewtonMeter
      : 0;
    this.port().request(
      this.#powerRequested,
      this.profile.baselineW + this.#activityW,
    );
  }
  deliver(engineFraction: number): Readonly<DamperReading> {
    const allocation = this.port().delivery();
    const fraction =
      this.#operating && allocation.suppliedW >= this.profile.baselineW
        ? this.#activityW > 0
          ? Math.min(
              1,
              (allocation.suppliedW - this.profile.baselineW) / this.#activityW,
            )
          : 1
        : 0;
    const capturing = this.#capture !== undefined;
    if (capturing && fraction > 0) this.#captureElapsed += this.#dt * fraction;
    this.#reading = Object.freeze({
      requested: this.#requested,
      state:
        this.#thermal.state(this.#requested) ??
        (fraction === 0
          ? 'waiting-for-charge'
          : fraction < 1
            ? 'limited'
            : 'online'),
      thermal: this.#thermal.telemetry,
      mode: fraction === 0 ? 'coast' : capturing ? 'capture' : 'assisted',
      demandW: this.#powerRequested
        ? this.profile.baselineW + this.#activityW
        : 0,
      suppliedW: allocation.suppliedW,
      activityFraction: fraction,
      worldForceN: Object.freeze({
        x: (this.#force.x + this.#drive.x * engineFraction) * fraction,
        y: (this.#force.y + this.#drive.y * engineFraction) * fraction,
        z: (this.#force.z + this.#drive.z * engineFraction) * fraction,
      }),
      yawTorqueNm:
        (this.#torque + this.#driveTorque * engineFraction) * fraction,
      captureDurationSeconds: this.#capture?.durationSeconds ?? 0,
      captureElapsedSeconds: Math.min(
        this.#captureElapsed,
        this.#capture?.durationSeconds ?? 0,
      ),
      transmittedFraction:
        1 - fraction * (1 - this.profile.capture.transmittedFraction),
    });
    if (this.#capture && this.#captureElapsed >= this.#capture.durationSeconds)
      this.#capture = undefined;
    if (fraction === 0) {
      this.#engagement = true;
      this.#capture = undefined;
    }
    return this.#reading;
  }
  get temperatureK(): number {
    return this.#thermal.temperatureK;
  }
  heatAbove(sinkTemperatureK: number): number {
    return this.#thermal.heatAbove(sinkTemperatureK);
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
    if (this.#thermal.telemetry.tripped) {
      this.#engagement = true;
      this.#capture = undefined;
    }
  }
  get telemetry(): Readonly<DamperReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
  }
}
