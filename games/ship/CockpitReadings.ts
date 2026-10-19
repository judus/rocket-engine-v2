import type { ShipTelemetry } from './ShipMovement.js';
import type { ComputerReading } from './ShipComputer.js';

/** Presentation only: read committed telemetry, never create a second system ledger. */
export function cockpitReadings(
  t: Readonly<ShipTelemetry>,
  c: Readonly<ComputerReading>,
) {
  const hottest = c.modules.reduce<(typeof c.modules)[number] | undefined>(
    (hot, module) =>
      module.temperatureK !== null &&
      (hot?.temperatureK === null ||
        hot?.temperatureK === undefined ||
        module.temperatureK > hot.temperatureK)
        ? module
        : hot,
    undefined,
  );
  const thermalTrip = c.alerts.find((alert) => alert.id.endsWith('/thermal'));
  const heat = hottest
    ? `${hottest.label.toUpperCase()} ${(hottest.temperatureK! - 273.15).toFixed(0)}°C`
    : 'NO THERMAL DATA';
  const selected = new Set(
    t.mounts.selectedWeapons.map((m) => m.installationId),
  );
  const ready = t.mounts.installations.filter(
    (m) =>
      selected.has(m.installationId) &&
      ['idle', 'operating'].includes(m.operation.state),
  ).length;
  const target = t.navigation.destination;
  return {
    overhead: [
      {
        label: 'HULL',
        fraction: t.hull.remainingJ / t.hull.capacityJ,
        footer: thermalTrip ? 'THERMAL SHUTDOWN' : `HOT: ${heat}`,
        warning: t.hull.remainingJ < t.hull.capacityJ || !!thermalTrip,
        muted: false,
      },
      {
        label: 'SHIELDS',
        fraction: t.shields.energyJ / t.shields.capacityJ,
        footer: `${t.shields.state.toUpperCase()}${t.shields.active ? '' : ' / FIELD DOWN'}`,
        warning: ['failed', 'overheated', 'unpowered'].includes(
          t.shields.state,
        ),
        muted: !t.shields.active,
      },
      {
        label: 'ENERGY',
        fraction: c.reserveFraction,
        footer: `DRAW ${(c.consumptionW / 1e9).toFixed(2)} GW`,
        warning: c.reserveFraction <= 0.1,
        muted: false,
      },
    ],
    speed: `${t.navigation.speedMps.toFixed(1)} m/s`,
    mode: t.dampers.mode.toUpperCase(),
    target: target
      ? `${target.label} · ${(target.distanceM / 1000).toFixed(2)} km`
      : 'NO DESTINATION',
    weapons: `${t.mounts.selectedGroupId.toUpperCase()} · ${ready}/${selected.size} MOUNTS READY`,
    heat,
    alert: c.alerts[0]?.message ?? '',
    critical: c.alerts[0]?.severity === 'critical',
  };
}
export type CockpitReading = ReturnType<typeof cockpitReadings>;
