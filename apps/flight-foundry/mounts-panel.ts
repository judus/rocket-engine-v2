import type { Ship } from '../../games/farwake/Ship.js';
import type { MountsReading } from '../../games/farwake/ShipMounts.js';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
/** Lab editor; all changes go through the ship's queued capability commands. */
export class MountsPanel {
  #last = '';
  #instance = 0;
  constructor(
    private readonly root: HTMLElement,
    private readonly ship: () => Ship,
    private readonly message: HTMLElement,
  ) {}
  private paintOperations(reading: Readonly<MountsReading>): void {
    const root = document.querySelector<HTMLElement>('#mount-runtime');
    if (!root) throw new Error('Missing mount operation telemetry');
    const table = element('table');
    table.setAttribute('aria-label', 'Mounted equipment operation');
    const head = element('thead'),
      row = element('tr');
    for (const label of ['Mount / state', 'Power', 'Output', 'Heat', 'Health'])
      row.append(element('th', label));
    head.append(row);
    const body = element('tbody');
    const n = (value: number) =>
      value.toLocaleString('en', { maximumFractionDigits: 2 });
    for (const i of reading.installations) {
      const o = i.operation,
        r = element('tr');
      for (const text of [
        `${i.slotId} · ${o.state} · requested ${o.requested ? 'on' : 'off'}`,
        `${n(o.suppliedW / 1e6)} / ${n(o.demandW / 1e6)} MW`,
        `${n(o.outputW / 1e6)} MW · ${n(o.totalOutputJ / 1e6)} MJ total`,
        `${n(o.thermal.temperatureK - 273.15)} °C · +${n(o.thermal.generatedHeatW / 1e6)} / −${n(o.thermal.removedHeatW / 1e6)} MW · restart ${n(o.thermal.restartRemainingSeconds)} s`,
        `${n(o.health.points)} / ${n(o.health.maxPoints)} HP`,
      ])
        r.append(element('td', text));
      body.append(r);
    }
    table.append(head, body);
    root.replaceChildren(table);
  }
  private command(action: () => void): void {
    try {
      action();
      this.message.dataset.error = 'false';
      this.message.textContent =
        'Mount change queued. Run or Single step applies it.';
    } catch (error) {
      this.message.dataset.error = 'true';
      this.message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }
  paint(reading: Readonly<MountsReading>, reset = false): void {
    this.paintOperations(reading);
    const key = JSON.stringify({
      slots: reading.slots,
      groups: reading.groups,
      selectedGroupId: reading.selectedGroupId,
    });
    if (!reset && key === this.#last) return;
    this.#last = key;
    const mounts = this.ship().mounts;
    const status = element(
      'p',
      `Selected ${reading.selectedGroupId}: ${reading.selectedWeapons.map((i) => i.installationId).join(', ') || 'no weapons'}. Group selection does not fire.`,
    );
    const group = element('select');
    group.setAttribute('aria-label', 'Selected fire group');
    for (const g of reading.groups) group.add(new Option(g.id, g.id));
    group.value = reading.selectedGroupId;
    const choose = element('button', 'Select fire group');
    choose.type = 'button';
    choose.addEventListener('click', () =>
      this.command(() => mounts.selectGroup(group.value)),
    );
    const slot = element('select');
    slot.setAttribute('aria-label', 'Mount slot');
    for (const s of reading.slots) slot.add(new Option(s.id, s.id));
    const equipment = element('select');
    equipment.setAttribute('aria-label', 'Mount equipment');
    for (const e of mounts.profile.equipment)
      equipment.add(new Option(`${e.label} · ${e.kind}`, e.id));
    const install = element('button', 'Install equipment');
    install.type = 'button';
    install.addEventListener('click', () =>
      this.command(() =>
        mounts.install(
          slot.value,
          equipment.value,
          `lab-${slot.value}-${++this.#instance}`,
        ),
      ),
    );
    const remove = element('button', 'Remove equipment');
    remove.type = 'button';
    remove.addEventListener('click', () =>
      this.command(() => mounts.remove(slot.value)),
    );
    const toolbar = element('div');
    toolbar.className = 'toolbar';
    toolbar.append(slot, equipment, install, remove);
    const controls = element('div');
    controls.className = 'toolbar';
    for (const [label, action] of [
      ['Enable selected mount', () => mounts.requestEnabled(slot.value, true)],
      [
        'Disable selected mount',
        () => mounts.requestEnabled(slot.value, false),
      ],
      ['Damage selected mount · 25 HP', () => mounts.damage(slot.value, 25)],
      ['Repair selected mount · 25 HP', () => mounts.repair(slot.value, 25)],
    ] as const) {
      const button = element('button', label);
      button.type = 'button';
      button.addEventListener('click', () => this.command(action));
      controls.append(button);
    }
    const groupbar = element('div');
    groupbar.className = 'toolbar';
    groupbar.append(group, choose);
    const table = element('table');
    table.setAttribute('aria-label', 'Mount fire-group matrix');
    const head = element('thead'),
      hrow = element('tr');
    hrow.append(element('th', 'Slot'), element('th', 'Installed equipment'));
    for (const g of reading.groups) hrow.append(element('th', g.id));
    head.append(hrow);
    const body = element('tbody');
    for (const s of reading.slots) {
      const row = element('tr');
      const title = element('th', s.id);
      title.scope = 'row';
      row.append(title);
      const e = mounts.profile.equipment.find(
        (e) => e.id === s.installation?.equipmentId,
      );
      row.append(
        element(
          'td',
          s.installation
            ? `${e?.label} · ${s.installation.installationId}`
            : 'Empty',
        ),
      );
      for (const g of reading.groups) {
        const cell = element('td'),
          toggle = element('input');
        toggle.type = 'checkbox';
        toggle.setAttribute('aria-label', `${g.id} · ${s.id}`);
        toggle.checked = g.mountIds.includes(s.id);
        toggle.disabled = e?.kind !== 'weapon';
        toggle.addEventListener('change', () =>
          this.command(() => mounts.assign(g.id, s.id, toggle.checked)),
        );
        cell.append(toggle);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    const wrapper = element('div');
    wrapper.className = 'table-wrap module-matrix';
    wrapper.append(table);
    this.root.replaceChildren(status, groupbar, toolbar, controls, wrapper);
  }
}
