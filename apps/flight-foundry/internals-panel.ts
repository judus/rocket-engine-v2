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
      this.#slot.addEventListener('change', () =>
        this.paint(this.ship().telemetry.internals),
      );
      for (const id of reading.slots) {
        const installed = reading.installations.find((i) => i.slotId === id);
        this.#slot.add(
          new Option(`${id} · ${installed?.label ?? 'Empty'}`, id),
        );
      }
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
      const destination = node('select');
      destination.setAttribute('aria-label', 'Internal transfer destination');
      for (const i of reading.installations)
        if (i.inventory)
          destination.add(new Option(`${i.slotId} · ${i.label}`, i.slotId));
      const transfer = node('button', 'Transfer internal stock');
      transfer.type = 'button';
      transfer.addEventListener('click', () =>
        this.command(() => {
          if (!quantity.checkValidity() || !quantity.value)
            throw new Error('Enter a positive whole stock quantity');
          internals.transfer(
            slot(),
            destination.value,
            resources.value,
            Number(quantity.value),
          );
        }),
      );
      const transfers = node('div');
      transfers.className = 'toolbar';
      transfers.append(
        node('span', 'Transfer selected resource/quantity to'),
        destination,
        transfer,
      );
      const worker = node('select');
      worker.setAttribute('aria-label', 'Internal worker');
      worker.add(new Option('Unassigned', ''));
      for (const w of internals.profile.workers)
        worker.add(
          new Option(`${w.label} · ${w.specialty ?? 'generalist'}`, w.id),
        );
      const assign = node('button', 'Assign internal worker');
      assign.type = 'button';
      assign.addEventListener('click', () =>
        this.command(() =>
          internals.assignWorker(slot(), worker.value || null),
        ),
      );
      const staffing = node('div');
      staffing.className = 'toolbar';
      staffing.append(worker, assign);
      this.#inspection = node('div');
      this.root.replaceChildren(
        toolbar,
        buttons,
        stock,
        transfers,
        staffing,
        this.#inspection,
      );
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
      if (selected.inventory)
        facts.push(
          `Accepts: ${selected.inventory.rules?.accepts?.join(', ') ?? 'all resources'}.`,
        );
      if (selected.definitionId === 'fridge-starter')
        facts.push(
          'Food storage retains stock during power loss. Food spoilage is not modeled.',
        );
      if (selected.definitionId === 'quarters-starter')
        facts.push(
          'Powered quarters. Crew occupancy and fatigue recovery are not connected yet.',
        );
      if (selected.definitionId === 'science-lab-starter')
        facts.push(
          'Research consumes one machine part per science point. Science is local research credit; no unlocks are modeled yet.',
        );
      if (selected.definitionId === 'infirmary-starter')
        facts.push(
          'Produces health packs. Crew treatment and pack consumption are not connected yet.',
        );
      if (selected.facility) {
        const assignment = selected.facility.workerSlots[0];
        const staffing = this.ship().internals.profile.definitions.find(
          (d) => d.id === selected.definitionId,
        )!.staffing!;
        facts.push(
          `Operator: ${assignment ? this.ship().internals.profile.workers.find((w) => w.id === assignment.id)!.label : 'REQUIRED · unassigned'}. Preferred specialist: ${staffing.specialty} (+${((staffing.specialistMultiplier - 1) * 100).toFixed(0)}%). Worker efficiency: ${((assignment?.efficiency ?? 0) * 100).toFixed(0)}%.`,
        );
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
