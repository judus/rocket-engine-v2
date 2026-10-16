import { CharacterRuntime } from 'character-framework';
import type {
  SituationDefinition,
  SituationCapability,
  SituationInvocation,
  SituationGame,
  SituationSave,
  CapabilityResult,
  Json,
  Invocation,
} from 'character-framework';
import { EncounterWorld } from './World.js';
let nextWorld = 0;
const record = (v: unknown): v is Record<string, Json> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const schema = (properties: Record<string, Json>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const completed = (data: Json): CapabilityResult => ({
  status: 'completed',
  data,
});
/** Reusable game capability bridge: no authored stage or world entity IDs. */
export class QuestHost {
  readonly runtime: CharacterRuntime;
  readonly handle;
  readonly worldId = `encounter-${++nextWorld}`;
  readonly capabilities: SituationCapability[];
  #generation = '';
  #run: string | undefined;
  #disposed = false;
  #effects = new Map<string, { signature: string; result: CapabilityResult }>();
  #captures = new Map<string, { signature: string; cursor: Json }>();
  #cuts = new Map<string, number>();
  #journal: SituationSave | undefined;
  #loseReply = false;
  executions = 0;
  constructor(readonly world: EncounterWorld) {
    const inspection = (
      name: string,
      key: string,
      refs: string[],
      outputs: Record<string, Json>,
      stream?: string,
    ): SituationCapability => ({
      name,
      kind: 'inspection',
      description: 'Game-owned evidence for an existing named world reference.',
      inputSchema: schema({ [key]: { type: 'string', enum: refs } }),
      outputSchema: schema(outputs),
      ...(stream
        ? { evidenceStream: { ref: stream, captureKeys: [key] } }
        : {}),
      validate: (args) =>
        record(args) &&
        Object.keys(args).length === 1 &&
        typeof args[key] === 'string' &&
        refs.includes(args[key] as string),
      execute: (context, args) => this.#inspect(context, name, args),
    });
    const entityRefs = world.entities.map((e) => e.id);
    const groups = [
      ...new Set(
        world.entities.filter((e) => e.kind === 'enemy').map((e) => e.group),
      ),
    ];
    const action = (
      name: string,
      key: string,
      refs: string[],
      apply: (ref: string) => Json,
    ): SituationCapability => ({
      name,
      kind: 'action',
      description: 'Apply a validated consequence to existing game objects.',
      inputSchema: schema({ [key]: { type: 'string', enum: refs } }),
      outputSchema: schema({ applied: { type: 'boolean' } }),
      validate: (args) =>
        record(args) &&
        Object.keys(args).length === 1 &&
        typeof args[key] === 'string' &&
        refs.includes(args[key] as string),
      execute: (context, args) => {
        return this.#performAction(context, () =>
          completed(apply((args as Record<string, Json>)[key] as string)),
        );
      },
    });
    const refs = (kind: string) =>
      world.entities.filter((e) => e.kind === kind).map((e) => e.id);
    this.capabilities = [
      inspection(
        'game_location',
        'locationRef',
        world.spec.locations.map((l) => l.id),
        {
          inside: { type: 'boolean' },
          visited: { type: 'boolean' },
          count: { type: 'integer', minimum: 0 },
        },
        'location-entries',
      ),
      inspection(
        'game_encounter',
        'groupRef',
        groups,
        {
          remaining: { type: 'integer', minimum: 0 },
          count: { type: 'integer', minimum: 0 },
        },
        'enemy-defeats',
      ),
      ...(!world.spec.itemUses
        ? [
            inspection(
              'game_entity',
              'entityRef',
              entityRefs,
              {
                near: { type: 'boolean' },
                visible: { type: 'boolean' },
                collected: { type: 'boolean' },
                count: { type: 'integer', minimum: 0 },
              },
              'item-pickups',
            ),
          ]
        : []),
      action('game_activate_group', 'groupRef', groups, (ref) => {
        for (const e of world.entities.filter(
          (e) => e.group === ref && e.kind === 'enemy',
        ))
          if (world.spec.itemUses) world.setState(e, 'visible', !e.defeated);
          else e.visible = !e.defeated;
        return { applied: true };
      }),
      action(
        'game_reveal',
        'entityRef',
        entityRefs.filter(
          (ref) => !world.entities.find((e) => e.id === ref)!.initialOwnerRef,
        ),
        (ref) => {
          const e = world.entities.find((e) => e.id === ref)!;
          if (world.spec.itemUses && e.kind !== 'item')
            world.setState(e, 'visible', !e.defeated);
          else e.visible = !e.defeated && !e.collected;
          return { applied: true };
        },
      ),
      action('game_open_gate', 'entityRef', refs('gate'), (ref) => {
        const e = world.entities.find((e) => e.id === ref)!;
        if (world.spec.itemUses) world.setState(e, 'open', true);
        else e.open = true;
        return { applied: true };
      }),
      ...(refs('beacon').length
        ? [
            action('game_light_beacon', 'entityRef', refs('beacon'), (ref) => {
              world.entities.find((e) => e.id === ref)!.lit = true;
              return { applied: true };
            }),
          ]
        : []),
    ];
    const itemRefs = refs('item'),
      destinationRefs = [...refs('beacon'), ...refs('destination')];
    const objectRefs = [...refs('prop'), ...refs('destination')];
    if (!world.spec.itemUses && objectRefs.length)
      this.capabilities.push(
        inspection(
          'game_object',
          'entityRef',
          objectRefs,
          {
            active: { type: 'boolean' },
            interacted: { type: 'boolean' },
            count: { type: 'integer', minimum: 0 },
          },
          'object-interactions',
        ),
        action('game_activate_object', 'entityRef', objectRefs, (ref) => {
          world.entities.find((e) => e.id === ref)!.active = true;
          return { applied: true };
        }),
      );
    if (!world.spec.itemUses)
      this.capabilities.push({
        name: 'game_delivery',
        kind: 'inspection',
        description:
          'New matching item delivery committed by ordinary game interaction.',
        inputSchema: schema({
          itemRef: { type: 'string', enum: itemRefs },
          destinationRef: { type: 'string', enum: destinationRefs },
        }),
        outputSchema: schema({
          count: { type: 'integer', minimum: 0 },
          delivered: { type: 'boolean' },
        }),
        evidenceStream: {
          ref: 'item-deliveries',
          captureKeys: ['itemRef', 'destinationRef'],
        },
        validate: (args) =>
          record(args) &&
          Object.keys(args).length === 2 &&
          itemRefs.includes(args['itemRef'] as string) &&
          destinationRefs.includes(args['destinationRef'] as string),
        execute: (context, args) =>
          this.#inspect(context, 'game_delivery', args),
      });
    if (world.spec.itemUses) {
      this.capabilities.push(
        inspection(
          'inventory_item',
          'itemRef',
          itemRefs,
          {
            ownerRef: { type: ['string', 'null'] },
            quantity: { type: 'integer', minimum: 0 },
            contents: { type: ['string', 'null'] },
            usesRemaining: { type: ['integer', 'null'], minimum: 0 },
            placedAt: { type: ['string', 'null'] },
            available: { type: 'boolean' },
            visible: { type: 'boolean' },
            near: { type: 'boolean' },
            count: { type: 'integer', minimum: 0 },
          },
          'item-pickups',
        ),
      );
      const states = world.entities.filter((e) => e.kind !== 'item');
      this.capabilities.push({
        name: 'entity_state',
        kind: 'inspection',
        description:
          'Inspect a supported entity state; count transitions to true.',
        inputSchema: {
          oneOf: states.map((e) =>
            schema({
              entityRef: { const: e.id },
              state: { type: 'string', enum: world.supportedStates(e) },
            }),
          ),
        },
        outputSchema: schema({
          value: { type: 'boolean' },
          count: { type: 'integer', minimum: 0 },
        }),
        evidenceStream: {
          ref: 'entity-state-events',
          captureKeys: ['entityRef', 'state'],
        },
        validate: (args) =>
          record(args) &&
          Object.keys(args).length === 2 &&
          states.some(
            (e) =>
              e.id === args['entityRef'] &&
              world.supportedStates(e).includes(args['state'] as string),
          ),
        execute: (c, args) => this.#inspect(c, 'entity_state', args),
      });
      const holders = refs('guide');
      const transfers = itemRefs.flatMap((itemRef) =>
        holders.flatMap((holder) => [
          { itemRef, fromRef: 'player', toRef: holder },
          { itemRef, fromRef: holder, toRef: 'player' },
        ]),
      );
      const uses = world.spec.itemUses.map((rule) => ({
        itemRef: rule.itemRef,
        targetRef: rule.targetRef,
      }));
      for (const [name, description, allowed] of [
        [
          'give_item',
          'Transfer an item between its current holder and a nearby character; one endpoint is player.',
          transfers,
        ],
        [
          'use_item',
          'Use a carried item on a nearby target. Discovered item-use rules specify contents, uses and target-state requirements.',
          uses,
        ],
      ] as const) {
        this.capabilities.push({
          name,
          kind: 'action',
          description,
          inputSchema: {
            oneOf: allowed.map((args) =>
              schema(
                Object.fromEntries(
                  Object.entries(args).map(([key, value]) => [
                    key,
                    { const: value },
                  ]),
                ),
              ),
            ),
          },
          outputSchema: schema({ applied: { type: 'boolean' } }),
          validate: (args) =>
            record(args) &&
            allowed.some(
              (pair) =>
                Object.keys(args).length === Object.keys(pair).length &&
                Object.entries(pair).every(([k, v]) => args[k] === v),
            ),
          execute: (c, args) =>
            this.#performAction(c, () => {
              if (!record(args)) throw new Error('Invalid item action');
              const operation =
                name === 'give_item'
                  ? world.giveItem(
                      args['itemRef'] as string,
                      args['fromRef'] as string,
                      args['toRef'] as string,
                    )
                  : world.useItem(
                      args['itemRef'] as string,
                      args['targetRef'] as string,
                    );
              return operation.applied
                ? completed({ applied: true })
                : {
                    status: 'rejected',
                    code: 'item-requirements',
                    message: operation.message,
                  };
            }),
        });
      }
    }
    const game: SituationGame = {
      capabilities: (c) => (c.id === 'director' ? this.capabilities : []),
      scopeAvailable: (c, s) =>
        c.id === 'director' && s.kind === 'player' && s.ref === 'player',
      capture: (context, stream, args) => {
        this.#trusted(context);
        const cap = this.capabilities.find(
          (c) => c.evidenceStream?.ref === stream,
        );
        if (!cap || !cap.validate(args))
          throw new Error('Invalid capture reference');
        const id = context.narrative.effectId,
          signature = this.#signature(context) + ':' + stream;
        if (!id) throw new Error('Missing capture identity');
        const prior = this.#captures.get(id);
        if (prior && prior.signature !== signature)
          throw new Error('Capture identity conflict');
        if (!prior) {
          if (this.#captures.size >= 256)
            throw new Error('Capture ledger full');
          const boundary =
            context.narrative.runId + ':' + context.narrative.entryId;
          if (!this.#cuts.has(boundary))
            this.#cuts.set(boundary, world.sequence);
          this.#captures.set(id, {
            signature,
            cursor: {
              world: this.worldId,
              stream,
              after: this.#cuts.get(boundary)!,
            },
          });
        }
        if (!world.historyAvailable || !world.historyComplete)
          throw new Error('Event evidence unavailable');
        return structuredClone(this.#captures.get(id)!.cursor);
      },
      observe: (context, observations) => {
        this.#trusted(context);
        const revision = String(world.revision);
        const results = observations.map((o) => {
          const cap = this.capabilities.find(
            (c) => c.name === o.capability.name && c.kind === 'inspection',
          );
          if (!cap || !cap.validate(o.arguments))
            throw new Error('Invalid observation');
          return this.#inspect(
            {
              ...context,
              narrative: {
                ...context.narrative,
                ...(o.evidence ? { evidence: o.evidence } : {}),
              },
            },
            cap.name,
            o.arguments,
          );
        });
        return { revision, results };
      },
      observationCurrent: (context, revision) => {
        this.#trusted(context);
        return revision === String(world.revision);
      },
      reconcile: (context, cap, args) => {
        this.#trusted(context);
        if (
          cap.kind !== 'action' ||
          !this.capabilities.some(
            (c) => c.name === cap.name && c.kind === cap.kind,
          ) ||
          !cap.validate(args)
        )
          throw new Error('Invalid reconciliation');
        const id = context.narrative.effectId;
        if (!id) throw new Error('Missing effect identity');
        const prior = this.#effects.get(id);
        if (!prior) return { status: 'not_admitted' };
        if (prior.signature !== this.#signature(context))
          return {
            status: 'rejected',
            code: 'identity-conflict',
            message: 'Effect provenance conflict',
          };
        return structuredClone(prior.result);
      },
      persist: (save) => {
        this.#live();
        this.#journal = structuredClone(save);
      },
      retire: (context) => {
        this.#trusted(context);
      },
    };
    this.runtime = new CharacterRuntime({
      gameId: 'rocket-encounter',
      capabilities: this.capabilities,
      situationGame: game,
    });
    const director = this.runtime.register({
      id: 'director',
      name: 'World director',
      capabilities: this.capabilities.map((c) => c.name),
    });
    this.#generation = director.snapshot().binding.generation;
    this.handle = this.runtime.situations!.bind(director);
  }
  #performAction(
    context: Invocation,
    apply: () => CapabilityResult,
  ): CapabilityResult {
    this.#trusted(context);
    const id = context.narrative.effectId,
      signature = this.#signature(context);
    if (!id) throw new Error('Missing action identity');
    const prior = this.#effects.get(id);
    if (prior) {
      if (prior.signature !== signature)
        throw new Error('Effect identity conflict');
      return structuredClone(prior.result);
    }
    if (this.#effects.size >= 256) throw new Error('Effect ledger full');
    const result = apply();
    if (result.status !== 'completed') return result;
    this.world.revision++;
    this.executions++;
    this.#effects.set(id, { signature, result });
    if (this.#loseReply) {
      this.#loseReply = false;
      throw new Error('Consequence acknowledgement lost after commit');
    }
    return result;
  }
  #live(): void {
    if (this.#disposed) throw new Error('Quest host disposed');
    this.world.live();
  }
  #trusted(context: Invocation): asserts context is SituationInvocation {
    this.#live();
    if (
      context.signal.aborted ||
      context.gameId !== 'rocket-encounter' ||
      context.character.id !== 'director' ||
      context.character.binding?.generation !== this.#generation ||
      !context.narrative ||
      context.narrative.scope.kind !== 'player' ||
      context.narrative.scope.ref !== 'player'
    )
      throw new Error('Untrusted game context');
  }
  #signature(context: Invocation): string {
    return JSON.stringify(context.narrative);
  }
  #inspect(context: Invocation, name: string, args: Json): CapabilityResult {
    this.#trusted(context);
    const cap = this.capabilities.find(
      (c) => c.name === name && c.kind === 'inspection',
    );
    if (!cap || !cap.validate(args) || !record(args))
      throw new Error('Invalid inspection');
    if (name === 'inventory_item' || name === 'entity_state') {
      const e = this.world.entities.find(
        (e) =>
          e.id === args[name === 'inventory_item' ? 'itemRef' : 'entityRef'],
      )!;
      let count = 0;
      const ev = context.narrative.evidence;
      if (ev) {
        const cursor = ev.cursor,
          stream = cap.evidenceStream!;
        if (
          !this.world.historyAvailable ||
          !this.world.historyComplete ||
          ev.streamRef !== stream.ref ||
          !record(cursor) ||
          cursor['world'] !== this.worldId ||
          cursor['stream'] !== stream.ref ||
          typeof cursor['after'] !== 'number' ||
          !Number.isSafeInteger(cursor['after']) ||
          cursor['after'] < 0 ||
          cursor['after'] > this.world.sequence ||
          stream.captureKeys.some((k) => ev.arguments[k] !== args[k])
        )
          return { status: 'running', operationId: 'evidence-unavailable' };
        count = this.world.count(
          name === 'inventory_item' ? 'pickup' : 'state',
          name === 'inventory_item'
            ? e.id
            : e.id + '/' + (args['state'] as string),
          cursor['after'],
        );
      }
      return completed(
        name === 'inventory_item'
          ? {
              ownerRef: e.ownerRef,
              quantity: e.quantity,
              contents: e.contents,
              usesRemaining: e.usesRemaining,
              placedAt: e.deliveredTo,
              available: e.quantity > 0,
              visible: e.visible,
              near: this.world.near(e),
              count,
            }
          : { value: this.world.stateValue(e, args['state'] as string), count },
      );
    }
    if (name === 'game_delivery') {
      const itemRef = args['itemRef'] as string,
        destinationRef = args['destinationRef'] as string;
      let count = 0;
      const ev = context.narrative.evidence;
      if (ev) {
        const cursor = ev.cursor;
        if (
          !this.world.historyAvailable ||
          !this.world.historyComplete ||
          ev.streamRef !== 'item-deliveries' ||
          !record(cursor) ||
          cursor['world'] !== this.worldId ||
          cursor['stream'] !== 'item-deliveries' ||
          typeof cursor['after'] !== 'number' ||
          !Number.isSafeInteger(cursor['after']) ||
          cursor['after'] < 0 ||
          cursor['after'] > this.world.sequence ||
          ev.arguments['itemRef'] !== itemRef ||
          ev.arguments['destinationRef'] !== destinationRef
        )
          return { status: 'running', operationId: 'evidence-unavailable' };
        count = this.world.count(
          'delivery',
          `${itemRef}@${destinationRef}`,
          cursor['after'],
        );
      }
      return completed({
        count,
        delivered:
          this.world.entities.find((e) => e.id === itemRef)!.deliveredTo ===
          destinationRef,
      });
    }
    const key =
      name === 'game_location'
        ? 'locationRef'
        : name === 'game_encounter'
          ? 'groupRef'
          : 'entityRef';
    const ref = args[key] as string;
    let count = 0;
    const evidence = context.narrative.evidence;
    if (evidence) {
      const c = evidence.cursor,
        stream = cap.evidenceStream!.ref;
      if (
        !this.world.historyAvailable ||
        !this.world.historyComplete ||
        evidence.streamRef !== stream ||
        !record(c) ||
        c['world'] !== this.worldId ||
        c['stream'] !== stream ||
        typeof c['after'] !== 'number' ||
        !Number.isSafeInteger(c['after']) ||
        c['after'] < 0 ||
        c['after'] > this.world.sequence ||
        evidence.arguments[key] !== ref
      )
        return { status: 'running', operationId: 'evidence-unavailable' };
      count = this.world.count(
        name === 'game_location'
          ? 'location'
          : name === 'game_encounter'
            ? 'defeat'
            : name === 'game_object'
              ? 'interaction'
              : 'pickup',
        ref,
        c['after'],
      );
    }
    if (name === 'game_location')
      return completed({
        inside: this.world.inside.has(ref),
        visited: this.world.visited.has(ref),
        count,
      });
    if (name === 'game_encounter')
      return completed({
        remaining: this.world.entities.filter(
          (e) => e.kind === 'enemy' && e.group === ref && !e.defeated,
        ).length,
        count,
      });
    const e = this.world.entities.find((e) => e.id === ref)!;
    if (name === 'game_object')
      return completed({ active: e.active, interacted: e.interacted, count });
    return completed({
      near:
        e.visible &&
        Math.hypot(e.x - this.world.position.x, e.y - this.world.position.y) <=
          48,
      visible: e.visible,
      collected: e.collected,
      count,
    });
  }
  /** Generic declarative bootstrap; the definition supplies the initial situation and all routes. */
  async start(definition: SituationDefinition) {
    this.#live();
    await this.handle.publish(definition, 'publish:' + definition.id);
    const v = await this.handle.start(
      definition.id,
      { kind: 'player', ref: 'player' },
      'start:' + definition.id,
    );
    this.#run = v.runId;
    return v;
  }
  get view() {
    return this.#run && !this.#disposed ? this.handle.read(this.#run) : null;
  }
  get journal() {
    return this.#journal ? structuredClone(this.#journal) : null;
  }
  loseNextReply(): void {
    this.#live();
    this.#loseReply = true;
  }
  advance(dt: number): void {
    this.#live();
    this.runtime.advance(dt);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.runtime.dispose();
    return;
  }
}
