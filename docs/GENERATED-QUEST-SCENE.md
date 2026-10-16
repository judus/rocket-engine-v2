# Generated quest village

The generated quest consumer (`quest-consumer.html`) uses `examples/quest-authoring/village-world.json`. The original watchtower remains on `character-encounter.html`, with its original world and quest data. The authoring usage example remains unchanged and is illustrative, not this scene's assignment.

The village contains a mage, an impulsive friend, an old woman, a house, a garden, a well, a fire pit, a portable cursed stone, a log, a sword, a garden ornament, and two initially hidden enemy groups. There is no built-in mission or conflict. The game-owned briefing supplies a broad setting; entity details and capability schemas supply actual world facts.

The closed barrier spans the complete map height. Its exact geometry is shared by player traversal and accessibility/distance queries. The house footprint is solid. Opening the barrier is a quest consequence, not an automatic response to proximity.

Portable items are cursed stone, log, sword, bucket and matchbox. The mage initially holds the empty bucket; the old woman holds three matches in a matchbox. Held items are discoverable through tools but do not appear as ground pickups. `inventory_item` reports actual custody, quantity, contents, remaining uses and acquisition counts. `entity_state` accepts only supported entity/state pairs; its event count records transitions to true (ordinary inspections record each inspection).

`give_item` transfers an item between the protagonist and a nearby NPC. The current owner must match; transfer does not copy the item. `use_item` accepts only the item/target pairs declared in the scene. A log fuels the pit and is consumed. A match lights a fueled, unlit pit and consumes one match. An empty bucket fills at the well. Water extinguishes a burning pit or waters an unwatered herb bed, leaving the bucket empty. The cursed stone can be dropped into the well and is consumed. Enemies require the carried sword. All prerequisites are checked before mutation, including proximity and obstruction by movement blockers.

Select a carried item in the page controls; use it on a nearby target or give it to a nearby character. E/click performs ordinary interaction with empty hands, or uses the selected item on an object. NPC-to-protagonist transfers are authored consequences. These actions share the existing CFW effect ledger, including reconciliation after a lost acknowledgement. The village does not expose the replaced `game_entity`, `game_delivery`, `game_object` or `game_activate_object` capabilities. The original watchtower retains its own catalogue and interactions. No mood, curse simulation or persistent relationship model has been introduced.

All characters use the existing Panel/ChatBox and authored dialogue; proximity guards use discovered character references. No character-specific quest sequence is embedded in gameplay. The unloaded scene is explorable before a quest is generated.

The MCP authoring endpoint loads the same village world and `village-author-context.json`. Its private launcher uses a separate village authoring store. Existing watchtower publications remain in their original store; old definitions are not translated into village references. Provider registration, schemas and transport continue through the existing host.

Verification: the scene tests exercise actual CFW consequences, inaccessible/accesssible navigation across the barrier, building collision, weapon eligibility, pickup/delivery custody, object inspection, discovery and neutral briefing. Original watchtower runtime tests still run. These checks do not establish creative variation or the playability of a future generated quest. No generation is part of scene setup.
