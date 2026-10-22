# Ship capture response — parameterized model slice

Julien's steering after the Flight Curves experiment: the approximately 12 km/s example is a reference capture condition, not a Newtonian speed cap. Beyond that reference, capture takes longer and braking becomes progressively steeper; transmitted crew load increases. Numbers remain exploratory. This slice implements the independent calculation, not the full ship game or another UI screen.

## Current implementation

`games/farwake/CaptureResponse.ts` provides validated `CaptureProfile` data and an immutable `CapturePlan` selected once at engagement. No DOM, clocks, ECS storage, body mutation or power consumption is involved. The existing Flight Curves screen still displays ideal required protection; it has **not** been switched to this equipment-response model. The original motion bench is unchanged.

```ts
const plan = new CapturePlan(installedDamperProfile, entrySpeedMps);
const request = plan.at(elapsedCaptureSeconds);
// request.requestedAccelerationMps2 is a controller request.
// request.nominalCrewG assumes the profile's stated transmission is available.
```

A ship controller can later request the acceleration from this response. The resource/delivery layer must determine what is actually supplied, and the body must integrate delivered forces once. Do not assign the predicted speed into the physical body or claim nominal protection when its power/service is unavailable. Cancellation, partial/zero delivery, heat, actual versus desired trajectory and interior protection under shortage remain separate integration work. This calculation alone is not acceptance of the full assisted-flight milestone.

## Profile parameters to expose

| Parameter                     | Meaning                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `assistedSpeedMps`            | Speed envelope capture aims to reach; does not restrict Newtonian flight.                                             |
| `referenceExcessMps`          | Anchor speed **to remove** above that envelope, not total entry speed.                                                |
| `referenceDurationSeconds`    | Capture duration at/below the anchor in this initial policy.                                                          |
| `durationGrowthExponent`      | How quickly duration grows above the anchor.                                                                          |
| `baseCurvePower`              | Baseline braking concentration: 1 is constant acceleration; 2 matches the planner's strongest linear early/late ramp. |
| `curvePowerGrowthPerDoubling` | Additional braking concentration per doubling of excess speed above the anchor.                                       |
| `peakAt`                      | Concentrate braking near the start or the end.                                                                        |
| `transmittedFraction`         | Nominal fraction reaching the crew: 0.01 means 1% felt / 99% suppression. It is not an automatic crew-load target.    |

Actual entry speed is a plan input, independent of the equipment profile. At/below the assisted envelope, capture does nothing and does not accelerate the ship up to the envelope. The profile and plan are immutable: editing equipment data does not silently change an active capture. A future controller must define deliberate re-engagement/replanning; repeatedly planning from remaining speed each tick would invent a different response.

## Response law

Let `Δv = max(0, entrySpeed − assistedSpeed)` and `r = max(1, Δv/referenceExcess)`.

- `T = referenceDuration × r^durationGrowthExponent`
- `p = baseCurvePower + curvePowerGrowthPerDoubling × log₂(r)`
- Average ship acceleration magnitude is `Δv/T`.
- Peak ship acceleration magnitude is `p × Δv/T`.
- Nominal crew acceleration is ship acceleration multiplied by `transmittedFraction`.

A growth exponent between zero and one makes time grow sublinearly with excess speed. Positive curve-power growth increases concentration above the anchor. Both controls can be zero for comparison; those settings deliberately disable the corresponding growth. No singularity or jump exists at the anchor, though the growth-law slope changes there. Below the anchor this first policy holds duration and shape constant, giving progressively gentler captures; that is an explicit policy, not a final handling decision.

For elapsed fraction `u=t/T`, late-peaking braking removes fraction `u^p` of the excess speed. Early-peaking braking removes `1−(1−u)^p`. Their analytical accelerations and distances match the velocity derivatives/integrals. They have the same duration, average load and peak load but different onset and braking distance. Noninteger powers are supported. `p≥1` prevents infinite acceleration at engagement. Completion ends acceleration; endpoint peak metrics include the limit just before completion. These curves are not jerk-limited.

## Illustrative behavior, not settled balance

The example uses an 800 m/s assisted envelope, 12,000 m/s **excess-speed** anchor, four-second baseline, duration exponent `log₁₀(2)`, baseline power 2, power growth 0.2 per doubling, late peak and 1% transmitted load.

| Excess to remove | Total entry speed | Capture duration | Curve power | Peak nominal crew load |
| ---------------- | ----------------- | ---------------- | ----------- | ---------------------- |
| 12 km/s          | 12.8 km/s         | 4 s              | 2           | ~6.12 G                |
| 24 km/s          | 24.8 km/s         | ~4.93 s          | 2.2         | ~10.93 G               |
| 120 km/s         | 120.8 km/s        | 8 s              | ~2.66       | ~40.75 G               |

This does not assert that 6 G is medically safe or that this is the right balance. The older screenshot's 12→0 km/s in four seconds with a peak twice average asks for ~611.83 ship G; fixed 99% suppression leaves ~6.12 crew G, whereas the ideal planner requests ~99.0193% suppression to hold exactly 6 G. That distinction is why the model must report delivered/nominal load rather than silently clamp it to a design target.

## Boundaries and verification

Profiles reject missing/unknown fields and nonfinite/out-of-range values. Bounds are experimental calculation bounds, not ship upgrade limits: speeds ≤10⁸ m/s, positive reference excess ≥1 m/s, baseline duration 0.01–120 s, duration exponent 0–1, base curve power 1–16, shape growth 0–4 per doubling, transmission 0–1. This remains a classical requested-motion model, with no relativistic guarantee.

`tests/capture-response.test.ts` covers reference/over-reference behavior, independent growth controls, anchor continuity, early/late distance differences, analytical derivatives and integrated braking impulse, exact target speed, zero capture, constant braking, nominal protection, immutable engagement data and invalid boundaries. There is no claim of game feel or actual powered-system readiness. Next integration work must preserve a shared fixed step and one authoritative body, then compare requested versus delivered capture and protection under explicit adequate/partial/zero resource budgets.

The assembled ship now consumes this plan through `games/farwake/ShipDampers.ts`. See `games/farwake/README.md` for actual power-limited integration, recovery behavior and limitations. The mathematical plan itself still assumes full service.
