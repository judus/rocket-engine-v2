# HUD and targeting direction

Agreed visual concept, 22 October 2026. First playable implementation now uses
one fixed-step targeting solution for pulse-cannon aim and the projected rings.

| Element                         | Meaning                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Fixed outer ring                | Acquisition/tracking area; a target must be inside to be acquired                            |
| Target-following segmented ring | Follows the locked target; shrinks and closes when tracking and within firing distance       |
| Fixed crosshair and centre dot  | Stable ship-forward orientation reference                                                    |
| Movable inner aiming ring       | Actual weapon firing direction, including auto-aim while the target is inside the outer ring |
| Steering line and bubble        | Mouse virtual-stick displacement; independent of targeting                                   |

Leaving the outer ring does not clear the locked target. The segmented ring opens
and continues following it. Weapons revert to their unassisted firing direction,
and the aiming ring shows that direction. Returning inside the outer ring restores
weapon tracking; the aiming ring quickly moves to the target firing solution.
Acquisition area and firing distance are different conditions. An open segmented
ring outside the acquisition area takes precedence even if the target is close.

Current steering presentation trial: a line with the same core thickness as the
rings and a small filled bubble. No permanent steering/targeting coupling is implied.

Current prototype: with no lock, acquire the unobstructed asteroid centre nearest
the crosshair inside the outer circle. T cycles eligible candidates, ordered by
angular distance from centre. T is reserved for this prototype and does nothing
while cockpit displays are active. Selection survives range/cone exit and
occlusion, but a destroyed target releases the lock and permits reacquisition.
The target ring is hidden behind the pilot, without an offscreen arrow.

Pulse-cannon firing distance is speed × lifetime (6 km). Tracking requires the
centre inside the acquisition circle, firing distance and clear line of sight.
The small aiming circle and bolts share the actual aim solution, with a 60 ms
response time toward or away from tracking. Static asteroid intercept compensates
inherited ship velocity. Moving-target prediction and per-weapon gimbal limits
remain future work. The closed target circle is currently 65% of the open radius;
shape/transition polish remains provisional. The HUD target label shows combat
lock; radar destination remains navigation-owned.

Explicit lock clearing, configurable target-cycle binding, offscreen arrows and
per-weapon tracking capabilities remain to be decided. Ship-follow autopilot is separate from weapon tracking.
See [weapon reference](WEAPON-REFERENCE.md) for seven mount slots, including three
double-muzzled mounts. Muzzle positions and convergence belong to the weapon slice.
