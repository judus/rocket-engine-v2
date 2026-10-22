import type { Ship } from '../../games/farwake/Ship.js';
import type { ComputerReading } from '../../games/farwake/ShipComputer.js';
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
export class ComputerPanel {
  #select = el('select');
  #status = el('div');
  #alerts = el('ul');
  #jobs = el('div');
  #key = '';
  constructor(root: HTMLElement, ship: () => Ship, message: HTMLElement) {
    this.#select.setAttribute('aria-label', 'Computer module');
    this.#alerts.setAttribute('aria-label', 'Computer warnings');
    const toolbar = el('div');
    toolbar.className = 'toolbar';
    toolbar.append(this.#select);
    for (const [label, enabled] of [
      ['Enable selected module', true],
      ['Disable selected module', false],
    ] as const) {
      const button = el('button', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        try {
          ship().computer.setEnabled(this.#select.value, enabled);
          message.textContent =
            'Computer command sent. Run or Single step applies the owning module update.';
          message.dataset.error = 'false';
        } catch (error) {
          message.dataset.error = 'true';
          message.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });
      toolbar.append(button);
    }
    this.#select.addEventListener('change', () =>
      this.paint(ship().computer.telemetry),
    );
    root.append(
      toolbar,
      this.#status,
      this.#alerts,
      el('h3', 'Production overview'),
      this.#jobs,
    );
  }
  paint(reading: Readonly<ComputerReading>, reset = false): void {
    const key = JSON.stringify(
      reading.modules
        .filter((m) => m.requested !== null)
        .map((m) => [m.id, m.label]),
    );
    if (reset || key !== this.#key) {
      this.#key = key;
      const selected = reset ? '' : this.#select.value;
      this.#select.replaceChildren(
        ...reading.modules
          .filter((m) => m.requested !== null)
          .map((m) => new Option(m.label, m.id)),
      );
      if (
        reading.modules.some((m) => m.id === selected && m.requested !== null)
      )
        this.#select.value = selected;
    }
    const module = reading.modules.find((m) => m.id === this.#select.value);
    const facts = [
      `Committed tick ${reading.tick} · ${reading.timeSeconds.toFixed(2)} s · reserve ${(reading.reserveFraction * 100).toFixed(1)}%.`,
    ];
    facts.push(
      `Generation ${(reading.generationW / 1e9).toFixed(3)} GW · consumption ${(reading.consumptionW / 1e9).toFixed(3)} GW.`,
    );
    if (module)
      facts.push(
        `${module.label} · ${module.state} · requested ${module.requested ? 'on' : 'off'} · ${(module.healthFraction * 100).toFixed(0)}% health.`,
        `${module.id === 'core:reactor' ? 'Starter: ' : ''}${(module.suppliedW / 1e6).toFixed(2)} / ${(module.demandW / 1e6).toFixed(2)} MW supplied/requested${module.temperatureK === null ? '' : ` · ${(module.temperatureK - 273.15).toFixed(1)} °C`}.`,
      );
    this.#status.replaceChildren(...facts.map((text) => el('p', text)));
    this.#alerts.replaceChildren(
      ...(reading.alerts.length
        ? reading.alerts.map((a) =>
            el('li', `${a.severity.toUpperCase()} · ${a.message}`),
          )
        : [el('li', 'No current warnings.')]),
    );
    const jobs = reading.modules.flatMap((m) =>
      m.jobs.map((j) =>
        el(
          'p',
          `${m.label} · ${j.recipeId} · ${j.state} · ${(j.progress * 100).toFixed(1)}% · completed ${j.batchesCompleted}`,
        ),
      ),
    );
    this.#jobs.replaceChildren(...jobs);
  }
}
