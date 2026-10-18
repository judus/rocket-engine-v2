import type { Ship } from '../../games/ship/Ship.js';
import type { MountsReading } from '../../games/ship/ShipMounts.js';

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
    const key = JSON.stringify(reading);
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
    this.root.replaceChildren(status, groupbar, toolbar, wrapper);
  }
}
