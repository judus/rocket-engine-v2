# Flight Foundry — checkpoint 1

Open <http://localhost:8092/apps/flight-foundry/> after `npm run start` at the repository root. `npm run dev` watches TypeScript when a server is already running.

This first instrument bench measures one-dimensional classical motion. It implements the force/coast/counter-thrust checkpoint discussed in topic #781, not the later capture or resource simulations. It leaves the cockpit unchanged.

## Composition and ownership

`FoundryShip` uses the existing typed `attach()` contract: `ship.control`, `ship.engine`, `ship.body`. One attached `MotionStep` declares those dependencies and explicitly orders commands → force → integration → immutable observation. The body owns position/velocity; there is no shared writable property store. This application uses Node2D as the established capability/lifecycle host, with its visual transforms unused; it does not claim a completed general 3D entity facade. These are app-local capabilities, not new engine exports.

The browser uses Rocket with a headless, keep-alive Stage2D. There is **no canvas**, independent scheduler or physics in DOM callbacks. Running uses Rocket's fixed clock; paused single-step and Finish run invoke the same scene fixed-step path with the applied timestep. Presentation samples at approximately 10 Hz and the plot/history retains roughly 300 observations per experiment. Manual/offline stepping advances simulation time, not wall time. Hidden-tab/slow-frame behavior follows Rocket; dropped wall time is displayed and never applied as a large physics step.

Each constant-force interval integrates `a = F/m`, `v₁ = v₀ + a Δt`, `x₁ = x₀ + v₀ Δt + ½a Δt²`. Intervals split exactly at scenario boundaries and the final duration, including boundaries between ticks. The body separately accumulates path length, including velocity reversals. Coast turns thrust off immediately; counter-thrust is **fixed negative thrust**, not automatic stop-at-zero braking. No progressive thrust response is implied yet. Adding response/capture later must retain one tested motion model.

The displayed phase is the next scenario command. Force/acceleration/G describe the completed interval (time-weighted when a tick straddles phases). Ship G uses 9.80665 m/s²; it is not a crew-protection model. Position is signed; path length is nonnegative. Kinetic energy is an observation, not an electrical cost law.

## Controls and replay

- Exact fields accept scientific notation in the displayed SI unit. Positive mass/thrust/timestep sliders use logarithmic exploration; velocity and durations use linear exploration. Editable From/To bounds change slider range without changing the value. An out-of-range exact value disables the slider until its bounds include it. Zero thrust has an explicit button.
- Candidate edits do not change the running experiment. **Apply & reset** validates the entire candidate before replacing the run. **Reset** repeats the currently applied profile, preserving candidate edits. **Baseline** edits the candidate only.
- Run/pause, single-step and Finish run share the same simulation. Finish run computes the remaining scenario immediately. The previous run is retained on reset/apply, including its profile; partial runs are labelled. The current/previous traces share fitted axes and a zero line. Baseline: 100,000 kg, 1 MN, 10 s burn + 5 s coast + 10 s counter-thrust → 100 m/s peak, 0 m/s final, 1,500 m displacement.
- Save/load stores a validated version-1 experiment in local browser storage. Export writes copyable JSON; import validates it before applying. Documents contain mass/thrust, initial velocity, all phase durations and timestep. Previous-run history is session-only. Errors are visible; no invalid profile silently replaces the current run.
- Numerical exploration limits are explicit boundary checks, distinct from slider bounds: mass 10⁻⁶–10¹⁵ kg, thrust 0–10²⁰ N, initial velocity ±10⁸ m/s, each phase 0–120 s, timestep 0.001–1/15 s; total duration must be positive. These are bench bounds, not balanced ship stats. The model remains Newtonian and does not claim relativistic accuracy at extreme inputs.

## Validation and remaining scope

`npm run check` runs the established strict TypeScript, ESLint, formatting and test/coverage gate, including `tests/flight-foundry.test.ts`. Tests check analytical force/mass motion, coast, reverse/path length, off-tick boundaries, timestep agreement, replay at different display cadences, observation/lifetime behavior and invalid persisted profiles.

No energy budget, damper/capture/protection, heat/cooling, cargo, collision, rotation or crew injury is implemented here. The next proposed checkpoint is two capture profiles under explicit supplied budgets; full reactor/thermal coupling follows separately. This bench cannot establish how combat controls feel or replace later rendered flight playtests.

## Flight Curves design screen

Open <http://localhost:8092/apps/flight-foundry/curves.html>. This additional screen preserves the force/motion bench and does not change the cockpit. It is an analytical kinematic planner, not a simulation of installed propulsion or dampers. Choose speeds, transition durations, independent early/late acceleration shapes and an ideal crew-load target. It updates immediately without a Run button. Starting/arrival speeds and an optional coast interval are under the disclosure. Starting above cruise explores a capture rather than forward acceleration. Speeds are displayed in km/s, stored/calculated in m/s.

Four graphs share time: speed, signed ship acceleration, ideal remaining crew G, and required suppression percentage. Scales are labelled independently; the crew target is dashed. Boundary samples include both sides of acceleration jumps so peaks are not lost. The scrubber inspects a selected instant (at a boundary it selects the new phase). Summary peaks include the just-ended phase. Required suppression is zero for zero load; otherwise it is `max(0, 1 − targetG/shipG) × 100%`. This is the suppression required at each instant, not a fixed 5% transmission profile or an achievable equipment rating. A zero-G target requests ideal 100% cancellation whenever accelerating. No load is added to reach the target when motion is already gentler.

For normalized phase time `u = t/T`, speed difference `Δv`, and shape `k` from −1 (strong early) through 0 (constant) to +1 (strong late):

- `v(u) = v₀ + Δv [(1−k)u + ku²]`
- `a(u) = Δv/T [1 + k(2u−1)]`
- `x(u) = x₀ + v₀Tu + ΔvT [(1−k)u²/2 + ku³/3]`

Thus shape changes preserve the endpoints and duration, but alter distance and peak acceleration. Both acceleration and braking are calculated separately. At the strongest skew, peak acceleration is twice the constant-acceleration case. All shape values have finite endpoint accelerations; these curves are not jerk-limited. At completion the planner assumes acceleration ends. Crew G is the magnitude of the attenuated load, with no artificial gravity, body-axis, exposure, injury or capacity model.

Default example: 0 → 800 → 0 m/s, four seconds per transition, constant acceleration, no coast. Total distance is 3.2 km, ship load is approximately 20.39 G, and holding ideal crew load to 2 G requires approximately 90.19% suppression. The separate two-minute cruise-distance readout is 96 km; it does not include the transition distances/time. These numbers are exploratory, not accepted game balance or human safety thresholds.

Positive speed sliders use logarithmic exploration; other sliders are linear. Exact fields can exceed the displayed slider range within validated model bounds, disabling that slider without silently clamping the setting. Invalid edits retain the last valid graphs and show an error. Reset example restores the candidate; this screen has no persisted settings or runtime equipment edits. Model bounds: speeds 0–10⁸ m/s, transition durations 0.1–120 s, coast 0–600 s, shapes −1…1 and crew target 0–20 G. At extreme speeds the Newtonian planner makes no relativistic claim.

`tests/flight-curves.test.ts` checks endpoints, derivatives, analytical distances, independent curve shapes, exact peaks, phase continuity, capture/coast, zero/100% protection and boundary validation. Rendered flight is still needed to judge feel; the graphs cannot determine fun or survivability.

## Capture response model (not yet connected to this UI)

The next model slice is [documented separately](../../docs/SHIP-CAPTURE-MODEL.md). `CaptureResponse.ts` takes an equipment profile and an entry speed, grows duration and braking concentration above a reference excess speed, and reports nominal crew G from the profile's transmission fraction. It does not cap crew G to the ideal planner's target. The current screens remain unchanged; this calculation does not yet drive a powered ship, heat model or injury system.
