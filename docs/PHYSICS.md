# Physics and streamed worlds

Status: local physics is a planned extension; large-world/streamed physics is a proposal and later experiment.

## Local foundation

Physics facility creates scene-owned worlds; worlds step once in a defined fixed phase. Static bodies, dynamic bodies, controlled movement and sensors expose different contracts. Collider generation is separate from map rendering.

Choose explicit simulation units and render conversion; no global spaceship-specific pixels/metres scale. Dynamic bodies own poses; behaviors issue forces/impulses or explicit teleports. Visual nodes read published/interpolated poses. Camera visibility never decides whether collisions occur.

Contacts are delivered after solver work. Structural changes are queued. After-physics impulses apply on the next step. Fixed timestep does not by itself guarantee deterministic physics.

Visual children and compound collider children are supported concepts. Independent simulated child bodies require explicit constraints/placement semantics; transform parenting is not a joint.

## Storage boundaries are not solver boundaries

Bodies cross terrain chunks continuously without recreation. Velocity, contacts and identity survive. World address is updated/normalized while backend pose remains relative to a simulation-region origin.

A region pins terrain data and installed collider resources needed by active simulation. Collider readiness differs from visual/data readiness. Body handles owned by nodes unregister safely; world disposal invalidates remaining handles.

## Precision experiment

Use exact integer addresses plus small local offsets outside the backend. Subtract addresses before converting nearby displacement to Number. Rebase between steps when local magnitudes grow; shift body poses, previous interpolation poses, static colliders, indexes, anchors and registered cached queries consistently. Backend support/reconstruction must be proven by prototype.

## Unloaded frontier

States: ready collision geometry, explicitly known empty, pending, failed. Request conservative swept regions, body extent and safety margins. Prefetch does not guarantee readiness.

Proposed first policy: pause the affected region before an unsafe step, retaining the last committed simulation state; UI/other independent regions can continue. Blocking at a conservative frontier is a later explicit option, not invented terrain impacts by default. Accurate reachable bounds and high-speed motion need a defined supported envelope.

Fast bodies also require sweep/continuous collision support; loading chunks alone does not prevent tunnelling. Teleports prepare the destination before moving. Failure is observable, not treated as empty space.

## Multiple regions

Start with one active region and explicit distant transfer. Separate remote regions keep numeric coordinates local. Interacting bodies must share a solver or an explicit cross-region model. Automatic merging/splitting is deferred; contacts, constraints and long-range forces prohibit arbitrary subdivision.

## Dormancy and persistence

World records preserve stable ID, pose, velocity and application state. Leaving active simulation transfers responsibility to dormant records, not another terrain-owned object. Application chooses freeze/offline progression. Node disappearance or chunk eviction does not silently delete production facilities, cargo or world objects.
