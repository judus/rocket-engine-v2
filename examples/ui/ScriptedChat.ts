import type {
  ChatPort,
  ChatSnapshot,
  ChatCommand,
  ChatMessage,
} from '../../src/ui/index.js';
/** Demo game provider. Owns conversation, requests and deterministic scripted replies; no AI dependency. */
export class ScriptedChat implements ChatPort {
  #session = 1;
  #revision = 0;
  #sequence = 0;
  #commands = 0;
  #disposed = false;
  #messages: ChatMessage[] = [];
  #pending: { requestId: string } | null = null;
  #error: { requestId: string; message: string } | null = null;
  #last: { requestId: string; text: string } | undefined;
  #listeners = new Set<(snapshot: ChatSnapshot) => void>();
  #seen = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #fail = false;
  delayMs = 1000;
  constructor() {
    this.#welcome();
  }
  get commands(): number {
    return this.#commands;
  }
  get listeners(): number {
    return this.#listeners.size;
  }
  #welcome(): void {
    this.#messages = [
      {
        id: `${this.#session}:welcome`,
        kind: 'assistant',
        speaker: 'Station guide',
        text: 'Welcome aboard. Ask about this station, try a quick response, or tell me a story. This is a scripted chat demo.',
      },
    ];
  }
  read(): ChatSnapshot {
    return Object.freeze({
      sessionId: `session-${this.#session}`,
      revision: this.#revision,
      messages: Object.freeze([...this.#messages]),
      choices: Object.freeze([
        { id: 'station', text: 'What is this station?' },
        { id: 'help', text: 'What can I try?' },
      ]),
      pending: this.#pending,
      error: this.#error,
    });
  }
  subscribe(listener: (snapshot: ChatSnapshot) => void): () => void {
    if (this.#disposed) throw new Error('Chat disposed');
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #emit(): void {
    this.#revision++;
    const snapshot = this.read();
    for (const listener of this.#listeners) listener(snapshot);
  }
  failNext(): void {
    this.#fail = true;
  }
  dispatch(command: ChatCommand): void {
    if (this.#disposed) throw new Error('Chat disposed');
    if (
      command.sessionId !== this.read().sessionId ||
      this.#seen.has(command.requestId)
    )
      return;
    if (command.kind === 'cancel') {
      if (this.#pending?.requestId !== command.pendingRequestId) return;
      this.#seen.add(command.requestId);
      this.#commands++;
      this.#cancel();
      this.#add('system', 'System', 'Reply cancelled.');
      this.#emit();
      return;
    }
    if (this.#pending) return;
    let text: string;
    if (command.kind === 'retry') {
      if (
        this.#error?.requestId !== command.failedRequestId ||
        this.#last?.requestId !== command.failedRequestId
      )
        return;
      text = this.#last.text;
    } else if (command.kind === 'choose') {
      const choice = this.read().choices.find(
        (choice) => choice.id === command.choiceId,
      );
      if (!choice) return;
      text = choice.text;
    } else {
      text = command.text.trim();
      if (!text || text.length > 2000) return;
    }
    this.#seen.add(command.requestId);
    this.#commands++;
    if (command.kind !== 'retry') this.#add('user', 'You', text);
    this.#error = null;
    this.#last = { requestId: command.requestId, text };
    this.#pending = { requestId: command.requestId };
    const session = this.#session,
      fail = this.#fail;
    this.#fail = false;
    this.#emit();
    this.#timer = setTimeout(() => {
      if (
        this.#disposed ||
        session !== this.#session ||
        this.#pending?.requestId !== command.requestId
      )
        return;
      this.#timer = undefined;
      this.#pending = null;
      if (fail)
        this.#error = {
          requestId: command.requestId,
          message:
            'The station link failed. Retry the reply or send a new message.',
        };
      else this.#add('assistant', 'Station guide', this.#reply(text));
      this.#emit();
    }, this.delayMs);
  }
  #reply(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('station'))
      return 'This is Waypoint Station: a quiet place to refuel, repair and plan your next trip. The cargo deck is below us; the observation ring is above.';
    if (lower.includes('try') || lower.includes('help'))
      return 'Try sending a message, a quick response, Shift+Enter for multiple lines, or the failure control. Both chat windows observe one conversation. Typing here does not move the orb.';
    if (lower.includes('story'))
      return 'A maintenance drone once mistook the captain’s coffee cup for a leaking coolant tank. It repaired the cup perfectly. The coffee was never the same.';
    return `I heard: “${text}”\n\nThis demo uses scripted replies. A game or character framework can supply the same presentation contract later.`;
  }
  #add(kind: ChatMessage['kind'], speaker: string, text: string): void {
    this.#messages.push(
      Object.freeze({
        id: `${this.#session}:${++this.#sequence}`,
        kind,
        speaker,
        text,
      }),
    );
    if (this.#messages.length > 64) this.#messages.shift();
  }
  #cancel(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending = null;
    this.#error = null;
    this.#last = undefined;
  }
  reset(): void {
    if (this.#disposed) throw new Error('Chat disposed');
    this.#cancel();
    this.#session++;
    this.#seen.clear();
    this.#welcome();
    this.#emit();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancel();
    this.#listeners.clear();
  }
}
