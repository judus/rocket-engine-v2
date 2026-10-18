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
