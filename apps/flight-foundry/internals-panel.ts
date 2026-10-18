import type { Ship } from '../../games/ship/Ship.js';
import type { InternalsReading } from '../../games/ship/ShipInternals.js';
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
}
export class InternalsPanel {
  #last = '';
  #instance = 0;
  #slot: HTMLSelectElement | undefined;
  #inspection = node('div');
  constructor(
    private readonly root: HTMLElement,
    private readonly ship: () => Ship,
    private readonly message: HTMLElement,
  ) {}
  private command(action: () => void): void {
    try {
      action();
      this.message.dataset.error = 'false';
      this.message.textContent =
        'Internal command queued. Run or Single step applies it; inspection shows the result.';
    } catch (error) {
      this.message.dataset.error = 'true';
      this.message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }
  paint(reading: Readonly<InternalsReading>, reset = false): void {
    const key = JSON.stringify(
      reading.installations.map((i) => ({
        slotId: i.slotId,
        installationId: i.installationId,
      })),
    );
    if (reset || key !== this.#last) {
      this.#last = key;
      const ship = this.ship(),
        internals = ship.internals;
      const previous = this.#slot?.value;
      this.#slot = node('select');
      this.#slot.setAttribute('aria-label', 'Internal slot');
      for (const id of reading.slots) this.#slot.add(new Option(id, id));
      if (previous && reading.slots.includes(previous))
        this.#slot.value = previous;
      const slot = () => this.#slot!.value;
      const definition = node('select');
      definition.setAttribute('aria-label', 'Internal installation');
      for (const d of internals.profile.definitions)
        definition.add(new Option(d.label, d.id));
      const resources = node('select');
      resources.setAttribute('aria-label', 'Internal resource');
      for (const r of ship.production.registry.resources)
        resources.add(new Option(r.label, r.id));
      const quantity = node('input');
      quantity.type = 'number';
      quantity.min = '1';
      quantity.step = '1';
      quantity.value = '4';
      quantity.setAttribute('aria-label', 'Internal stock quantity');
      quantity.style.width = '85px';
      const toolbar = node('div');
      toolbar.className = 'toolbar';
      toolbar.append(this.#slot, definition);
      const buttons = node('div');
      buttons.className = 'toolbar';
      for (const [label, action] of [
        [
          'Install internal',
          () =>
            internals.install(
              slot(),
              definition.value,
              `lab-internal-${++this.#instance}`,
            ),
        ],
        ['Remove internal', () => internals.remove(slot())],
        ['Enable internal', () => internals.requestEnabled(slot(), true)],
        ['Disable internal', () => internals.requestEnabled(slot(), false)],
        ['Drain internal', () => internals.setDraining(slot(), true)],
        ['Resume internal', () => internals.setDraining(slot(), false)],
        ['Damage internal · 25 HP', () => internals.damage(slot(), 25)],
        ['Repair internal · 25 HP', () => internals.repair(slot(), 25)],
      ] as const) {
        const button = node('button', label);
        button.type = 'button';
        button.addEventListener('click', () => this.command(action));
        buttons.append(button);
      }
      const stock = node('div');
      stock.className = 'toolbar';
      stock.append(resources, quantity);
      for (const [label, deposit] of [
        ['Supply lab stock', true],
        ['Collect internal stock', false],
      ] as const) {
        const button = node('button', label);
        button.type = 'button';
        button.addEventListener('click', () =>
          this.command(() => {
            if (!quantity.checkValidity() || !quantity.value)
              throw new Error('Enter a positive whole stock quantity');
            if (deposit)
              internals.supply(slot(), resources.value, Number(quantity.value));
            else
              internals.collect(
                slot(),
                resources.value,
                Number(quantity.value),
              );
          }),
        );
        stock.append(button);
      }
      this.#inspection = node('div');
      this.root.replaceChildren(toolbar, buttons, stock, this.#inspection);
    }
    const selected = reading.installations.find(
      (i) => i.slotId === this.#slot?.value,
    );
    const facts = [
      `Workshop tick ${reading.productionTick}. ${reading.slots.length} internal slots; ${reading.installations.length} installed.`,
      ...reading.commands.map(
        (r) => `${r.ok ? 'Applied' : 'Refused'}: ${r.message}`,
      ),
    ];
    if (!selected) facts.push('Selected slot is empty.');
    else {
      const o = selected.operation;
      facts.push(
        `${selected.label} · ${selected.installationId} · ${o.state} · ${o.health.points}/${o.health.maxPoints} HP · ${(o.thermal.temperatureK - 273.15).toFixed(2)} °C.`,
      );
      facts.push(
        `Power ${(o.suppliedW / 1e6).toFixed(2)}/${(o.demandW / 1e6).toFixed(2)} MW. Restart ${o.thermal.restartRemainingSeconds.toFixed(2)} s.`,
      );
      if (selected.inventory)
        facts.push(
          `Inventory ${selected.inventory.id}: ${JSON.stringify(selected.inventory.quantities)}. Reserved: ${JSON.stringify(selected.inventory.reserved)}. Capacity ${JSON.stringify(selected.inventory.capacity)}.`,
        );
      if (selected.facility) {
        facts.push(
          `Facility ${selected.facility.id} · draining ${selected.facility.draining ? 'on' : 'off'} · conditions ${JSON.stringify(selected.facility.conditions)}.`,
        );
        for (const job of selected.facility.jobs)
          facts.push(
            `${job.recipeId}: ${job.state} · ${(job.progress * 100).toFixed(1)}% · completed ${job.batchesCompleted}.`,
          );
      }
    }
    this.#inspection.replaceChildren(...facts.map((text) => node('p', text)));
  }
}
