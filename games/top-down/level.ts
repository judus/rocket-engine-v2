/** Shared by the runnable courtyard and its route regression test. */
export const courtyard = {
  bounds: { x: 24, y: 76, width: 912, height: 440 },
  obstacles: [
    { x: 396, y: 200, width: 168, height: 140 },
    { x: 90, y: 230, width: 150, height: 60 },
    { x: 720, y: 230, width: 150, height: 60 },
  ],
};
// Side lanes clear the walls by more than the scout's half-width plus turn tolerance.
export const scoutRoute = [
  { x: 60, y: 130 },
  { x: 900, y: 130 },
  { x: 900, y: 425 },
  { x: 60, y: 425 },
] as const;
