import type { SituationDefinition, SituationSave } from 'character-framework';
import { EncounterWorld } from '../character-encounter/World.js';
import type { WorldSpec } from '../character-encounter/World.js';
import { QuestHost } from '../character-encounter/QuestHost.js';
import { Journal } from '../../src/journal/index.js';
import type {
  EventInput,
  JournalProducer,
  Json,
} from '../../src/journal/index.js';
import { canonical } from '../../src/journal/value.js';
type SituationRun = SituationSave['runs'][number];
export type Seal = 'blue' | 'red';
export async function definitionDigest(
  definition: SituationDefinition,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(definition));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
const object = (v: Json): v is { [key: string]: Json } =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** Game adapter. Reads acknowledged CFW records and actual game state; never executes domain effects. */
export class WatchtowerReporter {
  #worldProducer: JournalProducer;
  #questProducer: JournalProducer;
  #worldStatus: { dispose(): undefined };
  #questStatus: { dispose(): undefined };
  #recordedThrough = 0;
  #worldRevision = -1;
  #runRevision = -1;
  #gap = false;
  #host: QuestHost | undefined;
  #definition: SituationDefinition | undefined;
  #digest = '';
  #episode = '';
  #choiceRequests = new Map<
    string,
    {
      host: QuestHost;
      runId: string;
      choiceRef: string;
      choiceLabel: string;
      revision: number;
      from: string;
    }
  >();
  #acceptedChoices = new Map<string, EventInput>();
  constructor(
    readonly journal: Journal,
    readonly world: EncounterWorld,
  ) {
    this.#worldProducer = journal.registerProducer('watchtower-game', {
      'watchtower.world_event': {
        version: 1,
        validate: (v) =>
          object(v) &&
          typeof v['kind'] === 'string' &&
          typeof v['ref'] === 'string',
      },
    });
    this.#questProducer = journal.registerProducer('watchtower-quests', {
      'quest.action_confirmed': {
        version: 1,
        validate: (v) => object(v) && typeof v['effectId'] === 'string',
      },
      'quest.choice_confirmed': {
        version: 1,
        validate: (v) => object(v) && typeof v['choiceRef'] === 'string',
      },
      'quest.mission_report': {
        version: 1,
        validate: (v) =>
          object(v) &&
          v['outcome'] === 'completed' &&
          typeof v['definitionDigest'] === 'string',
      },
    });
    this.#worldStatus = journal.registerStatus('world', () => ({
      revision: world.revision,
      recordedThrough: this.#recordedThrough,
      availability: this.#gap
        ? 'unavailable'
        : world.revision === this.#worldRevision
          ? 'available'
          : 'stale',
      data: {
        position: { x: world.position.x, y: world.position.y },
        entities: world.entities.map((e) => ({ ...e })),
        historyComplete: world.historyComplete,
      },
    }));
    this.#questStatus = journal.registerStatus('quests', () => {
      const view = this.#host?.view;
      return {
        revision: view?.revision ?? 0,
        recordedThrough: this.#recordedThrough,
        availability: this.#gap
          ? 'unavailable'
          : view?.revision === this.#runRevision
            ? 'available'
            : 'stale',
        data: view
          ? {
              runId: view.runId,
              definitionId: view.definitionId,
              stage: view.situationId,
              status: view.status,
              episode: this.#episode,
            }
          : null,
      };
    });
  }
  async attach(
    host: QuestHost,
    definition: SituationDefinition,
    episode: string,
  ): Promise<void> {
    this.#host = host;
    this.#definition = structuredClone(definition);
    this.#digest = await definitionDigest(this.#definition);
    this.#episode = episode;
  }
  /** Observe the exact accepted command, including choices that share a destination. */
  async choose(
    choiceRef: string,
    revision: number,
    commandId: string,
  ): Promise<void> {
    const host = this.#host;
    if (!host) throw new Error('Attach a quest before choosing');
    let request = this.#choiceRequests.get(commandId);
    if (request) {
      if (
        request.host !== host ||
        request.choiceRef !== choiceRef ||
        request.revision !== revision
      )
        throw new Error('Choice command identity conflict');
    } else {
      const view = host.view,
        offered = view?.choices.find((c) => c.id === choiceRef);
      if (!view || !offered || view.revision !== revision)
        throw new Error('Choice is not currently offered');
      if (this.#choiceRequests.size >= 64)
        throw new Error('Proof choice record limit reached');
      request = {
        host,
        runId: view.runId,
        choiceRef,
        choiceLabel: offered.label,
        revision,
        from: view.situationId,
      };
      this.#choiceRequests.set(commandId, request);
    }
    const result = await host.handle.choose(
      request.runId,
      request.choiceRef,
      request.revision,
      commandId,
    );
    this.#acceptedChoices.set(commandId, {
      eventId: request.runId + ':choice:' + commandId,
      type: 'quest.choice_confirmed',
      version: 1,
      subjectRefs: [request.from, result.situationId],
      correlation: { questRunId: request.runId, operationId: commandId },
      payload: {
        choiceRef: request.choiceRef,
        choiceLabel: request.choiceLabel,
        from: request.from,
        to: result.situationId,
        acceptedRevision: result.revision,
      },
    });
  }
  #report(
    run: SituationRun,
    definition: SituationDefinition,
  ): EventInput | undefined {
    if (run.status !== 'closed') return;
    const ending = run.path.at(-1),
      color: Seal | undefined =
        ending === 'blue-complete'
          ? 'blue'
          : ending === 'red-complete'
            ? 'red'
            : undefined;
    if (!color) return;
    const beacon = color === 'blue' ? 'beacon-a' : 'beacon-b',
      seal = color + '-seal';
    const entry = run.entries.at(-1),
      action = entry?.actions.find(
        (a) =>
          a.state === 'completed' &&
          a.result &&
          typeof a.result === 'object' &&
          !Array.isArray(a.result) &&
          a.result['applied'] === true,
      );
    const authored = definition.situations
      .find((s) => s.id === ending)
      ?.onEnter?.find((a) => a.id === action?.id);
    if (
      !action ||
      authored?.tool !== 'game_light_beacon' ||
      authored.arguments['entityRef'] !== beacon ||
      !this.world.entities.find((e) => e.id === beacon)?.lit ||
      this.world.entities.find((e) => e.id === seal)?.deliveredTo !== beacon
    )
      return;
    return {
      eventId: run.id + ':outcome',
      type: 'quest.mission_report',
      version: 1,
      subjectRefs: [seal, beacon],
      correlation: { questRunId: run.id },
      payload: {
        episode: this.#episode,
        questRunId: run.id,
        definitionId: definition.id,
        definitionDigest: this.#digest,
        outcome: 'completed',
        endingRef: ending!,
        choiceRefs: [...this.#acceptedChoices.values()]
          .filter((e) => e.correlation?.['questRunId'] === run.id)
          .map((e) => (object(e.payload) ? e.payload['choiceRef']! : null)),
        choiceHistory: definition.situations.some((s) => s.choices?.length)
          ? [...this.#acceptedChoices.values()].some(
              (e) => e.correlation?.['questRunId'] === run.id,
            )
            ? 'recorded'
            : 'unavailable'
          : 'not_applicable',
        evidence: [
          { source: 'watchtower-quests', eventId: 'effect:' + action.effectId },
          ...this.world.events
            .filter(
              (e) => e.kind === 'delivery' && e.ref === seal + '@' + beacon,
            )
            .map((e) => ({
              source: 'watchtower-game',
              eventId: 'world:' + e.sequence,
            })),
        ],
        confirmedEffects: [{ entityRef: beacon, lit: true }],
      },
    };
  }
  /** Serial application interaction boundary; on error caller retries this observation, not the action. */
  async capture(): Promise<void> {
    const host = this.#host,
      definition = this.#definition;
    if (!host || !definition) throw new Error('Attach a quest before capture');
    const view = host.view,
      saved = host.journal,
      run = saved?.runs.find((r) => r.id === view?.runId);
    const worldRevision = this.world.revision,
      runRevision = view?.revision ?? 0;
    if (!this.world.historyComplete || !this.world.historyAvailable) {
      this.#gap = true;
      throw new Error(
        'World history unavailable; cannot certify complete reporting',
      );
    }
    try {
      const executed = run
        ? saved?.definitions.find(
            (d) =>
              d.ownerKey === run.ownerKey &&
              d.definition.id === run.definitionId,
          )?.definition
        : undefined;
      if (run) {
        if (!executed || canonical(executed) !== canonical(definition))
          throw new Error(
            'Attached definition does not match executed definition',
          );
        this.#digest = await definitionDigest(executed);
      }
      for (const e of this.world.events)
        await this.#worldProducer.append({
          eventId: 'world:' + e.sequence,
          type: 'watchtower.world_event',
          version: 1,
          subjectRefs: [e.ref],
          payload: { kind: e.kind, ref: e.ref, worldSequence: e.sequence },
        });
      if (run) {
        for (const entry of run.entries)
          for (const action of entry.actions)
            if (action.state === 'completed')
              await this.#questProducer.append({
                eventId: 'effect:' + action.effectId,
                type: 'quest.action_confirmed',
                version: 1,
                subjectRefs: [entry.situationId],
                correlation: {
                  questRunId: run.id,
                  operationId: action.effectId,
                },
                payload: {
                  effectId: action.effectId,
                  stageRef: entry.situationId,
                  actionRef: action.id,
                  arguments: action.arguments,
                  result: action.result ?? null,
                },
              });
        for (const choice of this.#acceptedChoices.values())
          if (choice.correlation?.['questRunId'] === run.id)
            await this.#questProducer.append(choice);
        const report = this.#report(run, executed!);
        if (report) await this.#questProducer.append(report);
      }
      this.#recordedThrough = await this.journal.head();
      this.#worldRevision = worldRevision;
      this.#runRevision = runRevision;
      this.#gap = false;
    } catch (error) {
      this.#gap = true;
      throw error;
    }
  }
  dispose(): undefined {
    this.#worldProducer.dispose();
    this.#questProducer.dispose();
    this.#worldStatus.dispose();
    this.#questStatus.dispose();
    return;
  }
}
/** Controlled save only: no CFW run continuation is claimed; episode B starts a fresh run. */
export function snapshotWorld(world: EncounterWorld): Json {
  return {
    spec: structuredClone(world.spec) as unknown as Json,
    entities: world.entities.map((e) => ({ ...e })),
    position: { x: world.position.x, y: world.position.y },
    events: world.events.map((e) => ({ ...e })),
    visited: [...world.visited],
    inside: [...world.inside],
    revision: world.revision,
    sequence: world.sequence,
  };
}
export function restoreWorld(snapshot: Json): EncounterWorld {
  if (!object(snapshot)) throw new Error('Invalid world checkpoint');
  // Only checkpoints produced by this version/controlled proof are supported.
  const v = snapshot as unknown as {
    spec: WorldSpec;
    entities: EncounterWorld['entities'];
    position: EncounterWorld['position'];
    events: EncounterWorld['events'];
    visited: string[];
    inside: string[];
    revision: number;
    sequence: number;
  };
  if (
    !Array.isArray(v.entities) ||
    !Array.isArray(v.events) ||
    v.events.length > 512 ||
    !Number.isSafeInteger(v.revision) ||
    !Number.isSafeInteger(v.sequence)
  )
    throw new Error('Invalid world checkpoint');
  const world = new EncounterWorld(v.spec);
  if (
    v.entities.length !== world.entities.length ||
    v.entities.some((e, i) => e.id !== world.entities[i]?.id)
  )
    throw new Error('World checkpoint references differ');
  world.entities.splice(
    0,
    world.entities.length,
    ...structuredClone(v.entities),
  );
  world.observe(v.position);
  world.events.splice(0, world.events.length, ...structuredClone(v.events));
  world.visited.clear();
  v.visited.forEach((id) => world.visited.add(id));
  world.inside.clear();
  v.inside.forEach((id) => world.inside.add(id));
  world.revision = v.revision;
  world.sequence = v.sequence;
  return world;
}
