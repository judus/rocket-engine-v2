# Execution and lifecycle

Status: full phase order and lifecycle remain proposals. The implemented frame-only subset and concrete timing/error/preparation policies are described in [RUNTIME.md](RUNTIME.md). The implemented node traversal and mutation rules are in [NODES.md](NODES.md); they use immediate mutation with snapshots rather than the queued design below.

## One loop

Browser input listeners record state/events. The runtime snapshots input before work; listeners do not directly integrate bodies.

For zero or more fixed steps:

1. Deliver simulation input edges and queued commands.
2. Run fixed scene/node/behavior hooks.
3. Resolve transforms required by physics.
4. Step registered simulations in an explicitly defined order.
5. Publish body poses and committed contact events.
6. Run after-physics hooks.
7. Commit structural changes at safe boundaries.

For each frame:

1. Deliver frame-domain actions and run frame hooks once per active scene.
2. Build presentation transforms (including physics interpolation where applicable).
3. Update each active view's camera/controllers.
4. Render dirty views, using read-only scene presentation.

Simple animations only need update(dt) and draw(ctx, frame). Fixed update is optional. Previous/current poses and alpha do not alter authoritative simulation state. Frame effects on physical objects belong on visual children or presentation properties, not on the simulated body pose.

## Input edges

Frame-domain actions and view pointer snapshots are now implemented; see [SERVICES-INPUT.md](SERVICES-INPUT.md). The fixed-domain requirements below remain proposals.

Held state is available for every catch-up step. A pressed/released edge goes once to its eligible consumer; if no fixed step occurs it waits. Frame and fixed actions require defined routing; edge buffering, ordering of rapid presses/releases and overflow behavior need tests. Independent views have independent input scopes/focus policies.

## Behavior ordering

Initial hooks: fixedUpdate(dt), afterPhysics(dt), update(dt), plus lifecycle hooks. Within a phase, stable traversal order is documented. Dependencies should be expressed by collaborators/coordinators rather than relying on accidental attachment order. Numeric priority soup is not the default. Multi-simulation order (including Workshop logistics) requires a host coordinator.

## Activity versus ownership

Application owns registered scenes even when not displayed. Proposed activation claims: a displaying view or explicit background-simulation handle holds a claim; zero-to-one activates, one-to-zero suspends; multiple claims never duplicate updates. A scene can also be explicitly paused while claims exist.

prepare runs once before first activation; onActivate/onDeactivate can run repeatedly; dispose is final. Preparation failure cleans partial resources and leaves no active scene. Exact retry policy is open. View controls must not keep mutating inactive/paused scene objects accidentally.

## Safe mutation

Destroy requests mark nodes unavailable for later hooks immediately, with disposal at a safe boundary. Adds/removes are queued during traversal; newly attached behavior begins at the next eligible phase. Render traversal sees stable structure.

Detach transfers lifetime ownership to the caller; it does not destroy or automatically register the object in a second update list. Reparenting specifies local/world preservation. Moving between scenes releases old scene-membership resources and resolves new requirements explicitly.

## Cleanup

A resource scope normalizes subscriptions, timers, leases, controllers and disposable handles. The exact public protocol is open (functions versus objects versus JS disposal symbols).

Disposal stops scheduling and blocks new attachments/commands, cancels pending jobs, then tears down dependents before dependencies. Behaviors release subscriptions/body handles while their worlds/services still exist. Node children are disposed; scene resources follow the tree; views/scenes are disposed before shared services. Operations are idempotent and errors are aggregated without abandoning remaining cleanup.

Async results arriving after cancellation release their resources rather than attaching to disposed owners. Application stop retains state; final dispose releases it. Saving is a separate operation with an observable failure policy.

## Clock contracts requiring decisions

Fixed rate, frame-dt clamp, catch-up budget, retained backlog versus discarded elapsed time, background-tab pause and time scaling must be explicit. Do not copy the old timer's catch-up cap into production accounting silently. One host owns Workshop advancement; its internal tick size need not equal physics tick size.
