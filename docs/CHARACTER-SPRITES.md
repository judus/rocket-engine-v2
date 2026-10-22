# Archived character sprite gallery

Run `npm start` and open `http://127.0.0.1:8092/demos/character-sprites.html`.
The navigation lists it under UI & characters. This additional gallery preserves
the existing sprite and Mara demos. It uses Rocket's pinned Sprite-Animation 0.2.0;
no CFW API is needed and no package upgrade is included.

The six sheets are Female1, Female2 and Male1–Male4. Each has two independent
players sharing one scene-owned image lease. A initially idles facing front; B
walks facing right. Clicking either view or the character selector changes selection.
Activity and direction affect only that player. Front is south, back is north;
right mirrors the left-facing side frames. Pause affects only the selected player.
Characters stay in place: WASD and work/takeover/resume are later milestones.

Frames remain 32×48, with original idle durations of 0.5 seconds and walk durations
of 0.2 seconds. The archived metadata uses the first three rows of each sheet;
the additional appearance rows are retained in the unchanged image but not newly
interpreted. There is no separate run clip. The pivot is at (16,41), immediately
below the visible feet in the original frames. Both views render the same nodes;
only node updates advance playback, once per scene update.

`prepareCharacters` acquires each image sequentially and registers its lease with
the scene immediately. A later acquisition or dimension failure is rolled back by
application disposal: the scene retires players before releasing images. Close
second view leaves the scene alive. Dispose retires all 12 players and releases
six leases; recreate starts a fresh scene. Test preparation failure intentionally
requests a missing sixth sheet, disposes the first five, and permits recreate.
Page closure disposes the application and removes UI listeners.

## Asset provenance

Images and per-character JSON were copied from
`archive/game-engine-2/finally/assets/src/{img,libs}/fantasy-forest/characters`.
All six images were compared pixel-for-pixel with the original archived
`previously/itch.io/SzadiArt/Characters/NPC_Characters_v1.0` pack. All six frame
layouts and clip timings match the shared `metadata.ts`; original JSON is retained
beside each sheet. The pack's `_license.txt` and `_INFO.txt` are retained as
`examples/character-sprites/LICENSE.txt` and `INFO.txt`. Credit: SzadiArt.
The included licence permits use in personal/commercial works and websites,
and prohibits asset resale and trademark/logo use.

Verification covers independent playback, directional frame selection/mirroring,
feet pivot, transformed picking, disposal and partial preparation cleanup, plus
native browser selection, controls and lifecycle behavior.
