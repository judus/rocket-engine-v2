import type { NavigationContact } from '../../games/farwake/ShipNavigation.js';
/** Scene-owned demonstration coordinates, in metres. No sensor detection implied. */
export const navigationContacts: readonly NavigationContact[] = [
  {
    id: 'home',
    label: 'Home beacon',
    positionM: { x: 0, y: 0, z: 0 },
    arrivalRadiusM: 150,
  },
  {
    id: 'refinery',
    label: 'Refinery outpost',
    positionM: { x: 1200, y: 300, z: 4000 },
    arrivalRadiusM: 200,
  },
  {
    id: 'ridge',
    label: 'Ridge settlement',
    positionM: { x: -6000, y: -500, z: 9000 },
    arrivalRadiusM: 200,
  },
  {
    id: 'relay',
    label: 'Distant relay',
    positionM: { x: 0, y: 0, z: 40000 },
    arrivalRadiusM: 100,
  },
];
