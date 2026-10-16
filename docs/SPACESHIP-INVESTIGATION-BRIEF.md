Give the agent this complete task:

---

## Investigate and plan a clean spaceship demo for Rocket Engine v2

Investigate the capabilities needed for a new spaceship demo, verify what Rocket Engine v2 already supports, and use a small isolated ship-simulation proof to assess Matter.js suitability. Produce a coherent, evidence-backed implementation plan.

This is a **complete clean rewrite**. The requirements below describe the intended capabilities and experience. Do not use the old Rocket implementation as a code base, example, architectural template, or source of formulas and numerical tuning.

Read the complete task before starting. The physics investigation must inform the final capability assessment and implementation plan.

### 1. Required demo capabilities

**World generation and streaming**

- Space extends through streamed regions without requiring the entire world to remain resident.
- Procedural asteroid placement is reproducible from world seed, generator configuration/version, and region coordinates, independent of exploration order.
- Asteroids vary in appearance, size, shape, mass, durability, and other application-defined properties.
- Saved changes override generated initial state. Damaged or destroyed asteroids must not reset or reappear when their region unloads, reloads, or is restored from a save.
- Distinguish terrain/chunk residency, visual residency, and active simulation.

**Stateful entities**

- World objects have stable identities and extensible, role-specific state.
- Relevant properties include health/durability, faction affiliation, ownership, size, shape, mass, and game-specific attributes.
- Objects need only the properties their roles require. Do not impose one universal entity containing every possible field.
- Size, collision geometry, mass, and durability are distinct concepts, even when generation rules relate them.
- Authoritative object state can survive removal and recreation of its visual representation.
- Destruction, visual unloading, simulation dormancy, and final resource disposal have distinct meanings.

**Ship simulation and handling**

- Thrust accelerates a ship according to its mass and propulsion capabilities.
- Torque controls turning, with configurable rotational inertia.
- Unassisted flight retains momentum.
- Powered dampers provide configurable braking and stabilization.
- Assisted steering and manual flight offer distinct handling.
- Each ship profile supplies its own physical parameters, propulsion characteristics, and handling modifiers.
- Explain how modifiers combine and how switching modes affects an already-moving ship.
- Preserve the intended effects through independently designed rules; matching legacy numbers or trajectories is not required.

**Ship systems**

- Power generation/availability, consumption, allocation priorities, and requested versus actual system availability.
- Thermal generation, cooling, overheating consequences, module damage, and failure.
- Power availability, boost, heat, and system failure can affect propulsion or assistance through explicit game rules.
- Insufficient power prevents actions that require it.
- Identify unresolved rules and propose clearly labelled assumptions for experiments rather than silently making them requirements.

**Weapons and projectiles**

- Weapons attach to ship-relative mounts with appropriate position and orientation.
- Multiple muzzles and selectable weapon groups.
- Configurable firing cadence and resource costs; distinguish per-discharge and per-projectile costs.
- Projectile spawning uses the muzzle’s world pose.
- Projectiles inherit the firing ship’s motion.
- Collision/hit detection, shooter exclusion, explicit friendly-fire policy, damage, lifetime, and removal.
- One accepted hit produces the intended damage exactly once.
- Assess fast-projectile tunnelling and suitable sweep/continuous-hit detection requirements.

**Visual effects**

- Short-lived particles with configurable emission, position, velocity, appearance, lifetime, and cleanup.
- Burst effects for impacts and explosions.
- One-shot muzzle animations positioned at the appropriate mount.
- Separate visual particles from gameplay projectiles.
- Consistent camera/zoom transformation across ships, projectiles, and effects.
- Bounded resource use; do not assume every particle needs a rigid body or scene node.

**Presentation and interaction**

- Camera follow and zoom.
- Parallax background.
- Selection, picking, and highlighting.
- Cockpit feedback for motion, power, heat, system availability, and weapon groups.
- Presentation reads authoritative simulation state and issues commands without becoming a second simulation owner.

**Cross-cutting behavior**

- Explicit simulation-time, pause/resume, time-scaling, and catch-up policy.
- Firing cadence and effects use appropriate clocks.
- Save/restore of relevant world, entity, and ship state, including procedural-world identity and persistent destruction.
- Predictable ownership and cleanup of nodes, bodies, subscriptions, effects, and streamed resources.
- Camera visibility must not accidentally determine gameplay simulation or collisions.
- Moving entities must have defined ownership when crossing region boundaries.

Scanners, jammers, mining, trading, diplomacy, and other additional gameplay are outside this investigation unless necessary to explain a listed capability.

### 2. Inspect current capabilities

Inspect current source, applicable `AGENTS.md`, documentation, examples, contracts, and dependency versions in `/home/maduser/workspace/rocket-engine-v2` and relevant connected packages.

For each required capability, identify:

- What exists as a reusable API.
- What exists only in example/application code.
- What is documented as a proposal or direction but is not implemented.
- What belongs in the demo’s game rules.
- What might justify a reusable engine extension.
- An observable acceptance scenario.

Pay particular attention to `Node2D`, behaviors, transforms, spatial indexing, fixed timing, optional physics, streaming, procedural generation, persistence, and resource ownership.

Inspect Production Workshop integration as evidence of domain-state and presentation separation. Determine its actual use of nodes rather than assuming facilities are `Node2D` instances. Do not repurpose Workshop as the ship simulation or duplicate its authoritative state.

Support conclusions with source references. Distinguish verified behavior from inference and unresolved questions.

### 3. Investigate Matter.js with an isolated proof

Treat Matter.js as a candidate, not a predetermined backend.

Evaluate its public API for:

- Forces and torque.
- Runtime mass and rotational-inertia changes.
- Zero-gravity flight and configurable damping.
- Custom assistance and braking.
- Collision geometry and filtering.
- Projectile motion and high-speed hit detection.
- Fixed-step operation, body ownership, and cleanup.

Distinguish what Matter supports from what Rocket’s current adapter exposes.

Build a small disposable proof with **two noticeably different ship profiles**. Demonstrate:

- Acceleration under thrust.
- Coasting after thrust stops.
- Turning and rotational stabilization.
- Braking and damper switching while moving.
- Assisted versus manual handling.
- Reduced propulsion power.
- Projectile inheritance of ship velocity.

Use simple geometry and diagnostics. A polished game or browser playthrough is not required.

Compare behavior over the same simulated duration at more than one supported timestep. Report timestep sensitivity, parameter semantics, units, modifier composition, and relevant limitations.

Provide a suitability verdict: whether Matter can deliver the required effects, what custom ship logic remains necessary, and what Rocket adapter extensions would be needed. If a material limitation prevents suitability, explain it and investigate the smallest credible alternative. Do not build multiple complete physics backends.

### 4. Deliverables

Produce:

1. **A capability gap matrix** covering every requirement, with current support, source evidence, ownership, missing functionality, and acceptance scenarios.
2. **A ship-simulation suitability report** with reproducible proof instructions, results, limitations, and the Matter verdict.
3. **A responsibility model** separating authoritative world/entity state, ship rules, physics, presentation, and persistence.
4. **A separate proposed engine feature roadmap**, where each extension is justified by a concrete consumer need. Keep application rules out of the engine roadmap.
5. **A dependency-ordered demo implementation plan**, including the smallest first working slice, its acceptance criteria, and later slices.
6. **An examples/tutorial outline** explaining how the independently rebuilt systems can teach reusable Rocket capabilities.
7. **Open decisions and assumptions**, identifying which need human agreement before production implementation.

Finalize the gap matrix and roadmap **after incorporating the physics proof’s results**.

### 5. Working constraints

Shared projects remain read-only. Small disposable experiments are authorized in an isolated work directory.

Do not modify shared source, dependency trees, builds, databases, or services. Do not deploy or invoke real/paid providers.

Experiments support the investigation; they are not production implementations or architecture commitments.

Prefer existing capabilities where they meet the requirements. Propose extensions only for demonstrated gaps. Avoid speculative frameworks, a universal entity abstraction, or redesigning unrelated systems.

The outcome is a concrete plan for an independent rebuild—not a port of the old demo.

---
