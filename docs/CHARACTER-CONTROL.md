# WASD character control

Run `npm start`, then open `http://127.0.0.1:8092/character-control.html`.
Click either canvas and use WASD; hold either Shift key to run. Choose any of the six
original character sheets. Both views show the same actor, not separate controllers.
The existing animation gallery remains at `character-sprites.html`.

Walking is 80 world pixels/second. Running is 136 pixels/second (1.7×), with the
original walk clip played at 1.5× its normal rate. No run artwork is invented.
Stopped/blocked movement uses directional idle at normal playback rate. Facing
follows actual displacement; a blocked input does not animate walking in place.
Diagonal intent is normalized, so it cannot increase speed.

`DirectMovement` is the optional navigation module's direct-control pose owner.
It receives time, direction and speed from its caller, owns one immutable position,
and validates the complete swept segment using the existing `TraversalWorld`
contract. It owns no keyboard, clock, route planner or game state. It rejects a
whole obstructed step rather than tunnelling or sliding around obstacles. The
journey-based `Movement` API remains unchanged. A character uses one pose controller
at a time; this slice does not yet implement work/takeover/resumption.

`ControlledCharacter` advances movement and playback once from Rocket's existing
60 Hz fixed scene update. Render calls only draw snapshots. The ground footprint
has radius 8 plus clearance 1; the cyan circle shows that clearance. `GridTraversal`
blocks the wall, finite map edges and purple unknown tiles. Marking the purple
region known changes the caller-owned terrain observation, not another terrain
generator. Terrain costs do not scale direct-control speed in this slice.

Keyboard scope is limited to the focused canvas. Existing Input handling clears
keys on canvas/window blur and page hiding. Pause/resume, sheet changes, removal
and second-view disposal explicitly reset the scope. Pause leaves rendering alive
and clears input every fixed step. The scripted Panel/ChatBox is a focus test only;
typing there never supplies movement intent and requires no CFW/AI API.

The scene owns six image leases; sheet changes retire the prior player/pose owner
but retain those images. Removing the actor retires both movement and animation.
Disposal removes view input, panels/subscriptions, all players and leases. Recreate
builds a fresh scene. Asset preparation registers ownership immediately for rollback
on later load failure; original art/provenance is documented in CHARACTER-SPRITES.md.

Verification includes frame partition/diagonal/run displacement, full swept
obstacle/unknown checks with long steps, invalid inputs and disposed controllers,
actual-movement animation/rate/idle and browser keyboard/focus/lifecycle behavior.
