# Imported character definitions

Source of truth: `madhouse/agents/luna/farwake/characters/{sera,ren,nadia,bram}.json`.
Run `npm run import:crew` from the engine root to validate all four before replacing
these copies. An alternate source directory can be passed to
`node dist/scripts/import-crew-profiles.js <directory>` after building.

Each definition holds a stable ID, names, ship function and the complete collected
biography split into stable sections. Proposal and author notes remain in the data;
importing a draft does not declare all narrative proposals final canon.

The overview displays only names and functions. Health, fatigue and morale are
explicit placeholder UI values, separate from definitions and actual ship state.
Calls and gameplay-driven biography unlocking are not implemented here.

## Biography display

Details shows only section IDs admitted by `initialCrewKnowledge` in
`CrewBiography.ts`. The first version admits the explicitly public
"known from the beginning" section for each character; private backgrounds,
candidate perks/quirks, author notes and later plot sections remain hidden.
Unlock IDs are game knowledge, not changes to the canonical character definitions.

Text is wrapped to the measured display font and paginated without dropping prose.
Author citations and repository navigation are omitted from the rendered text;
source JSON remains intact. Next/Previous stop at the ends. Back to crew (or Esc)
returns to the overview; the following Esc closes the windshield display.

## Comms layout preview

Each crew member's Call button opens their square 512×512 H.264 clip at the
original 24 fps. Clips loop silently, retaining 25% saturation and the windshield
mesh. Only the selected clip loads. Closing the display, leaving flight or hiding
the document pauses playback; ending the call unloads it.

Dialogue choices remain layout placeholders, with no conversation effects or
audio. End call or Esc returns to the crew overview. The scene update publishes
changed video frames to a separate engine VideoTextureImage, capped to the source's 24 fps. The UI canvas only redraws when UI state changes. Video upload is direct
to WebGL; 25% saturation and registered mesh coverage run in the shader.
