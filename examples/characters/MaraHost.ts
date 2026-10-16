import type { Point } from '../../src/types.js';
import type { JourneySnapshot } from '../../src/navigation/index.js';
import { insideGrove, isGroveArrival } from './GroveVisit.js';
export type VisitPolicy = 'after-acceptance' | 'skip-if-visited';
import {
  CharacterRuntime,
  type Capability,
  type Json,
  type NarrativeResult,
} from 'character-framework';
import {
  CharacterHostPort,
  type HostDriver,
  type HostIntent,
  type HostChoice,
} from 'character-framework/host';
import type {
  ChatPort,
  ChatCommand,
  ChatSnapshot,
} from '../../src/ui/index.js';
import type { LocalDeparture } from './LocalDeparture.js';
import { HostChatPort } from './HostChatPort.js';
function object(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function data(result: NarrativeResult): { [key: string]: Json } {
  if (result.status !== 'completed' || !object(result.data))
    throw new Error(
      result.status === 'rejected'
        ? result.message
        : 'Invalid narrative result',
    );
  return result.data;
}
type Operation = {
  effectKey: string;
  intent: HostIntent;
  result: string | null;
};
type Task = {
  id: string;
  operation: Operation;
  remaining: number;
  started: boolean;
  runtimeId?: string;
  resolve: (result: string) => void;
  reject: (error: unknown) => void;
};
/** Game facts/actions stay here; CFW host port owns dialogue journal and command identity. */
export class MaraHost implements ChatPort {
  readonly runtime: CharacterRuntime;
  readonly character;
  readonly narrative;
  readonly author;
  readonly hostPort: CharacterHostPort;
  readonly chat: HostChatPort;
  visited = false;
  questStatus = 'No quest offered';
  questId: string | null = null;
  #choices: HostChoice[] = [];
  #questRevision = 0;
  #visits = 0;
  #acceptanceVisit = 0;
  #accepted = false;
  #recordedInside = false;
  #operations = new Map<string, Operation>();
  #task: Task | null = null;
  #fail = false;
  #disposed = false;
  #loseDepartureReply = false;
  constructor(
    private readonly departure?: LocalDeparture,
    readonly visitPolicy: VisitPolicy = 'after-acceptance',
  ) {
    const capability: Capability = {
      name: 'inspect_visit',
      kind: 'inspection',
      description: 'Read the game-owned Old Grove arrival fact.',
      inputSchema: {
        type: 'object',
        properties: {
          playerRef: { const: 'player' },
          locationRef: { const: 'grove' },
        },
        required: ['playerRef', 'locationRef'],
        additionalProperties: false,
      },
      validate: (input) =>
        object(input) &&
        Object.keys(input).length === 2 &&
        input['playerRef'] === 'player' &&
        input['locationRef'] === 'grove',
      execute: () => ({
        status: 'completed',
        data: { visited: this.questVisitSatisfied },
      }),
    };
    this.runtime = new CharacterRuntime({
      gameId: 'rocket-mara-proof',
      maxConcurrent: 1,
      maxPending: 4,
      capabilities: [capability],
      reasoning: {
        decide: (_context, observation) => {
          const text = object(observation) ? observation['text'] : '';
          if (
            typeof text === 'string' &&
            /^go to grove$/i.test(text.trim()) &&
            this.departure
          )
            return {
              dialogue: 'I will go to the Old Grove.',
              intention: { kind: 'depart', args: { destinationRef: 'grove' } },
            };
          if (
            typeof text === 'string' &&
            /work|quest|job|grove/i.test(text) &&
            !this.questId &&
            this.visitPolicy === 'skip-if-visited' &&
            this.visited
          )
            return {
              dialogue:
                'You have already reached the Old Grove, so I will not offer you that quest.',
            };
          if (
            typeof text === 'string' &&
            /work|quest|job|grove/i.test(text) &&
            !this.questId
          )
            return {
              dialogue: this.visited
                ? 'Please visit the Old Grove again after accepting. Earlier visits do not count for this quest.'
                : 'Will you visit the Old Grove? Accept my offer, then walk there.',
              intention: {
                kind: 'offer_visit',
                args: { locationRef: 'grove' },
              },
            };
          const facts: string[] = [];
          if (this.departure?.snapshot()?.status === 'arrived')
            facts.push('I reached the Old Grove.');
          if (this.questStatus === 'completed')
            facts.push(
              'You reached the grove. Thank you for keeping your word!',
            );
          else if (this.#accepted && !this.questVisitSatisfied)
            facts.push(
              'Your quest is active. Visit the Old Grove after accepting; earlier visits do not count. If you are still there, leave and return.',
            );
          else if (this.visited)
            facts.push(
              'You have already visited the Old Grove. That visit is recorded even after you return here.',
            );
          return {
            dialogue: facts.length
              ? facts.join(' ')
              : 'Hello! Ask me for work. The Old Grove is east of the wall.',
          };
        },
      },
      narrativeGame: {
        capabilities: (character) =>
          character.id === 'mara' ? [capability] : [],
        recipientAvailable: (_character, recipient) => recipient === 'player',
        referencesAvailable: (_character, condition) =>
          condition.tool === capability.name &&
          capability.validate(condition.arguments),
        inspectContext: (_character, input) =>
          input.scope === 'local'
            ? {
                status: 'completed',
                data: {
                  playerRef: 'player',
                  locationRef: 'grove',
                  visited: this.visited,
                },
              }
            : {
                status: 'rejected',
                code: 'scope_denied',
                message: 'Mara only has local context.',
                issues: [],
              },
      },
    });
    this.character = this.runtime.register({
      id: 'mara',
      name: 'Mara',
      entityId: 'mara-body',
      capabilities: [capability.name],
    });
    this.narrative = this.runtime.narrative!;
    this.author = this.narrative.bind(this.character);
    const driver: HostDriver = {
      current: () => {
        if (this.#disposed) throw new Error('Mara host disposed');
      },
      choices: () => this.#choices,
      run: (id, effectKey, intent) => this.#run(id, effectKey, intent),
    };
    this.hostPort = new CharacterHostPort(driver, () => undefined, {
      schemaVersion: 1,
      sessionId: crypto.randomUUID(),
      revision: 0,
      operations: [],
      deliveries: [],
      messages: [
        {
          id: 'welcome',
          speaker: 'character',
          kind: 'dialogue',
          text: 'Hello! Ask me for work, accept the offer, then walk to the Old Grove. This is a scripted CFW proof.',
        },
      ],
    });
    this.chat = new HostChatPort(this.hostPort, 'Mara');
  }
  get sessionId() {
    return this.chat.sessionId;
  }
  read(): ChatSnapshot {
    return this.chat.read();
  }
  subscribe(listener: (state: ChatSnapshot) => void): () => void {
    return this.chat.subscribe(listener);
  }
  dispatch(command: ChatCommand): void {
    this.chat.dispatch(command);
  }
  loseDepartureReply(): void {
    this.#loseDepartureReply = true;
  }
  failNext(): void {
    this.#fail = true;
  }
  #run(id: string, effectKey: string, intent: HostIntent): Promise<string> {
    if (this.#disposed) return Promise.reject(new Error('Mara host disposed'));
    const prior = this.#operations.get(id);
    if (
      prior &&
      (prior.effectKey !== effectKey ||
        JSON.stringify(prior.intent) !== JSON.stringify(intent))
    )
      return Promise.reject(new Error('Mara operation identity conflict'));
    if (prior?.result !== undefined && prior.result !== null)
      return Promise.resolve(prior.result);
    if (this.#task) return Promise.reject(new Error('Mara driver busy'));
    if (!prior && this.#operations.size >= 128)
      return Promise.reject(new Error('Mara operation ledger saturated'));
    const operation = prior ?? {
      effectKey,
      intent: structuredClone(intent),
      result: null,
    };
    this.#operations.set(id, operation);
    return new Promise((resolve, reject) => {
      this.#task = {
        id,
        operation,
        remaining: intent.kind === 'dialogue' ? 0.65 : 0,
        started: false,
        resolve,
        reject,
      };
    });
  }
  advance(dt: number): void {
    if (this.#disposed) return;
    const task = this.#task;
    if (task && !task.started) {
      task.remaining -= dt;
      if (task.remaining <= 0) {
        task.started = true;
        const intent = task.operation.intent;
        if (this.#fail && intent.kind === 'dialogue') {
          this.#fail = false;
          this.#finish(
            task,
            new Error(
              'Injected scripted reply failure before any quest effect. Retry retains the original host operation.',
            ),
          );
        } else if (intent.kind === 'choice') {
          void this.narrative
            .choose('player', intent.choiceId, task.operation.effectKey)
            .then(async (result) => {
              data(result);
              await this.#inspect();
              this.#finish(task, undefined, 'Quest choice committed.');
            })
            .catch((error) => this.#finish(task, error));
        } else {
          const admission = this.character.requestDecision({
            text: intent.message,
            visited: this.visited,
          });
          if (admission.status === 'accepted')
            task.runtimeId = admission.requestId;
          else this.#finish(task, new Error(admission.message));
        }
      }
    }
    this.runtime.advance(dt);
    for (const event of this.runtime.drainEvents()) {
      const current = this.#task;
      if (!current || event.requestId !== current.runtimeId) continue;
      if (event.kind === 'failed') {
        this.#finish(current, new Error('CFW reasoning failed.'));
        continue;
      }
      if (event.kind === 'decision' && object(event.data)) {
        const dialogue = event.data['dialogue'];
        const intention = event.data['intention'] ?? null;
        const args = object(intention) ? (intention['args'] ?? null) : null;
        if (typeof dialogue !== 'string') {
          this.#finish(current, new Error('Missing CFW dialogue'));
          continue;
        }
        if (object(intention) && intention['kind'] === 'depart') {
          if (
            !this.departure ||
            !object(args) ||
            Object.keys(args).length !== 1 ||
            args['destinationRef'] !== 'grove'
          ) {
            this.#finish(current, new Error('Invalid departure intention'));
            continue;
          }
          void this.departure
            .run({
              sessionId: this.sessionId,
              operationId: current.id,
              effectKey: current.operation.effectKey,
              actor: this.departure.actor,
              incarnation: this.departure.incarnation,
              destinationRef: 'grove',
            })
            .then((outcome) => {
              if (this.#disposed || this.#task !== current) return;
              if (this.#loseDepartureReply) {
                this.#loseDepartureReply = false;
                this.#finish(
                  current,
                  new Error(
                    'Injected lost departure reply after terminal outcome. Retry reuses the original journey outcome.',
                  ),
                );
              } else
                this.#finish(
                  current,
                  undefined,
                  `Mara journey ${outcome.status}${outcome.reason ? ': ' + outcome.reason : ''}.`,
                );
            })
            .catch((error) => this.#finish(current, error));
        } else if (
          object(intention) &&
          intention['kind'] === 'offer_visit' &&
          object(args) &&
          Object.keys(args).length === 1 &&
          args['locationRef'] === 'grove' &&
          !this.questId
        )
          void this.#offer(current.operation.effectKey)
            .then(() => this.#finish(current, undefined, dialogue))
            .catch((error) => this.#finish(current, error));
        else this.#finish(current, undefined, dialogue);
      }
    }
    for (const event of this.narrative.drainEvents()) {
      if (event.questId !== this.questId) continue;
      if (event.type === 'quest_accepted' && !this.#accepted) {
        this.#accepted = true;
        this.#acceptanceVisit = this.#visits;
      }
      if (
        event.type === 'quest_completed' &&
        event.revision >= this.#questRevision
      ) {
        this.#questRevision = event.revision;
        this.questStatus = 'completed';
        this.#choices = [];
        this.chat.notice(
          'Quest completed: game-owned arrival was inspected by CFW. Chat with Mara again.',
        );
      }
    }
    void this.hostPort.publishAuthority().catch((error) => {
      if (!this.#disposed)
        this.chat.notice('Host quest publication failed: ' + String(error));
    });
  }
  get questVisitSatisfied(): boolean {
    return this.visitPolicy === 'skip-if-visited'
      ? this.visited
      : this.#accepted && this.#visits > this.#acceptanceVisit;
  }
  observePlayer(
    position: Readonly<Point>,
    journey: JourneySnapshot | undefined,
  ): void {
    if (!insideGrove(position)) this.#recordedInside = false;
    if (!this.#recordedInside && isGroveArrival(journey)) {
      this.#recordedInside = true;
      this.arriveAtGrove();
    }
  }
  /** Trusted game arrival evidence; scene observation deduplicates visits until physical exit. */
  arriveAtGrove(): void {
    if (this.#disposed) return;
    this.visited = true;
    this.#visits++;
  }
  async #offer(effectKey: string): Promise<void> {
    if (!this.questId) {
      const created = data(
        await this.author.call(
          'create_quest',
          {
            quest: {
              recipientRef: 'player',
              title: 'Visit the Old Grove',
              summary: 'Reach the grove east of the wall.',
              objectives: [
                {
                  id: 'visit',
                  description: 'Physically arrive at the Old Grove.',
                  condition: {
                    tool: 'inspect_visit',
                    arguments: { playerRef: 'player', locationRef: 'grove' },
                    expect: {
                      path: ['visited'],
                      operator: 'equals',
                      value: true,
                    },
                  },
                },
              ],
            },
          },
          effectKey + '/create',
        ),
      );
      if (typeof created['questId'] !== 'string')
        throw new Error('Missing quest ID');
      this.questId = created['questId'];
    }
    data(
      await this.author.call(
        'offer_quest',
        {
          questId: this.questId,
          recipientRef: 'player',
          dialogue: 'Will you visit the Old Grove?',
        },
        effectKey + '/offer',
      ),
    );
    await this.#inspect();
  }
  async #inspect(): Promise<void> {
    const result = data(
      await this.author.call('inspect_quest', {
        questId: this.questId,
        recipientRef: 'player',
      }),
    );
    if (this.#disposed) return;
    const revision = result['revision'];
    if (
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error('Missing CFW quest revision');
    if (revision < this.#questRevision) return;
    this.#questRevision = revision;
    if (typeof result['status'] === 'string')
      this.questStatus = result['status'];
    const choices = result['choices'];
    this.#choices = Array.isArray(choices)
      ? choices.flatMap((choice) =>
          object(choice) &&
          typeof choice['id'] === 'string' &&
          typeof choice['label'] === 'string'
            ? [{ id: choice['id'], label: choice['label'] }]
            : [],
        )
      : [];
  }
  #finish(task: Task, error?: unknown, result?: string): void {
    if (this.#disposed || this.#task !== task) return;
    this.#task = null;
    if (error !== undefined) task.reject(error);
    else if (result !== undefined) {
      task.operation.result = result;
      task.resolve(result);
    } else task.reject(new Error('Missing Mara result'));
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.chat.dispose();
    this.hostPort.dispose();
    this.#task?.reject(new Error('Mara host disposed'));
    this.#task = null;
    this.runtime.dispose();
  }
}
