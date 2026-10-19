import { ModuleHealth } from './ModuleHealth.js';
import type { HealthReading } from './ModuleHealth.js';
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
  readonly mode: 'coast' | 'assisted' | 'capture';
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly worldForceN: Readonly<Vec3>;
  readonly yawTorqueNm: number;
  readonly pitchTorqueNm: number;
  readonly rollTorqueNm: number;
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
  #pitchTorque = 0;
  #rollTorque = 0;
  #pitchDriveTorque = 0;
  #rollDriveTorque = 0;
  #activityW = 0;
  #dt = 0;
  #health: ModuleHealth;
  #thermal: ModuleThermal;
  #operating = false;
  #powerRequested = false;
  #reading: Readonly<DamperReading>;
  constructor(
    profile: DamperProfile,
    private readonly power: ShipPowerPlant,
    private readonly body: ShipBody,
    initialTemperatureK: number,
    initialHealthPoints: number,
  ) {
    this.profile = validateDamperProfile(profile);
    this.requires = [power, body];
    this.#health = new ModuleHealth(this.profile.health, initialHealthPoints);
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
    this.#reading = Object.freeze({
      requested: false,
      state: this.#health.telemetry.failed ? 'failed' : 'off',
      health: this.#health.telemetry,
      powerFraction: 0,
      thermal: this.#thermal.telemetry,
      mode: 'coast',
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      worldForceN: Object.freeze(zeroVector()),
      yawTorqueNm: 0,
      pitchTorqueNm: 0,
      rollTorqueNm: 0,
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
      throw new TypeError('Damper request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    if (value !== this.#requested) {
      this.#engagement = true;
      this.#capture = undefined;
      this.#captureElapsed = 0;
    }
    this.#requested = value;
  }
  /** Admit one interval before propulsion declares demand. Preserve raw pilot intent. */
  prepare(intent: Readonly<ShipIntent>): Readonly<ShipIntent> {
    const wasFailed = this.#health.telemetry.failed;
    this.#health.commit();
    const failed = this.#health.telemetry.failed;
    if (wasFailed && !failed)
      this.#thermal.requestChanged(false, this.#requested);
    const thermal = this.#thermal.begin(this.#requested && !failed);
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
    return this.#operating && this.#capture
      ? Object.freeze({ ...intent, thrust: Object.freeze(zeroVector()) })
      : intent;
  }
  declare(
    intent: Readonly<ShipIntent>,
    engine: Pick<
      EngineReading,
      'thrustN' | 'yawTorqueNm' | 'pitchTorqueNm' | 'rollTorqueNm' | 'requested'
    >,
    dt: number,
  ): void {
    this.#dt = dt;
    const body = this.body.telemetry;
    const v = body.velocityMps;
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
    const angularGain = -Math.expm1((-3 * dt) / this.profile.responseSeconds);
    const gyro = this.body.gyroscopicTorqueNm();
    this.#torque =
      (-this.body.yawInertiaKgM2 * body.yawRateRadps * angularGain) / dt +
      gyro.y;
    this.#pitchTorque =
      (-this.body.profile.pitchInertiaKgM2 *
        body.pitchRateRadps *
        angularGain) /
        dt -
      gyro.x;
    this.#rollTorque =
      (-this.body.profile.rollInertiaKgM2 * body.rollRateRadps * angularGain) /
        dt -
      gyro.z;
    this.#pitchDriveTorque =
      (this.body.profile.pitchInertiaKgM2 *
        Number(engine.requested) *
        intent.pitch *
        this.profile.maxPitchRateRadps *
        angularGain) /
        dt -
      engine.pitchTorqueNm;
    this.#rollDriveTorque =
      (this.body.profile.rollInertiaKgM2 *
        Number(engine.requested) *
        intent.roll *
        this.profile.maxRollRateRadps *
        angularGain) /
        dt -
      engine.rollTorqueNm;
    this.#driveTorque =
      (this.body.yawInertiaKgM2 *
        Number(engine.requested) *
        intent.yaw *
        this.profile.maxYawRateRadps *
        angularGain) /
        dt -
      engine.yawTorqueNm;
    this.#activityW = this.#operating
      ? (Math.hypot(this.#force.x, this.#force.y, this.#force.z) +
          Math.hypot(this.#drive.x, this.#drive.y, this.#drive.z)) *
          this.profile.wattsPerNewton +
        (Math.abs(this.#torque) +
          Math.abs(this.#driveTorque) +
          Math.abs(this.#pitchTorque) +
          Math.abs(this.#rollTorque) +
          Math.abs(this.#pitchDriveTorque) +
          Math.abs(this.#rollDriveTorque)) *
          this.profile.wattsPerNewtonMeter
      : 0;
    this.port().request(
      this.#powerRequested,
      this.profile.baselineW + this.#activityW,
    );
  }
  deliver(engineFraction: number): Readonly<DamperReading> {
    const allocation = this.port().delivery();
    const powerFraction =
      this.#operating && allocation.suppliedW >= this.profile.baselineW
        ? this.#activityW > 0
          ? Math.min(
              1,
              (allocation.suppliedW - this.profile.baselineW) / this.#activityW,
            )
          : 1
        : 0;
    const health = this.#health.telemetry;
    const fraction = powerFraction * health.outputFraction;
    const capturing = this.#capture !== undefined;
    if (this.#capture && fraction > 0)
      this.#captureElapsed = Math.min(
        this.#capture.durationSeconds,
        this.#captureElapsed + this.#dt * fraction,
      );
    this.#reading = Object.freeze({
      requested: this.#requested,
      state: health.failed
        ? 'failed'
        : (this.#thermal.state(this.#requested) ??
          (powerFraction === 0
            ? 'waiting-for-charge'
            : powerFraction < 1
              ? 'limited'
              : health.fraction < 1
                ? 'damaged'
                : 'online')),
      health,
      powerFraction,
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
      pitchTorqueNm:
        (this.#pitchTorque + this.#pitchDriveTorque * engineFraction) *
        fraction,
      rollTorqueNm:
        (this.#rollTorque + this.#rollDriveTorque * engineFraction) * fraction,
      captureDurationSeconds: this.#capture?.durationSeconds ?? 0,
      captureElapsedSeconds: Math.min(
        this.#captureElapsed,
        this.#capture?.durationSeconds ?? 0,
      ),
      transmittedFraction:
        1 - fraction * (1 - this.profile.capture.transmittedFraction),
    });
    if (fraction === 0) {
      this.#engagement = true;
      this.#capture = undefined;
    }
    return this.#reading;
  }
  /** Release capture only after the body has physically reached its target. */
  finishMotionStep(): void {
    if (!this.#capture) return;
    const v = this.body.telemetry.velocityMps;
    const target = this.#capture.targetSpeedMps;
    const error = Math.hypot(
      v.x - this.#captureDirection.x * target,
      v.y - this.#captureDirection.y * target,
      v.z - this.#captureDirection.z * target,
    );
    // Numerical convergence tolerance in m/s, not a gameplay speed allowance.
    // The interval remains a capture interval; held intent starts next step.
    if (error <= 1e-6) this.#capture = undefined;
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
