import type { Ship } from '../../games/ship/Ship.js';
import type { NavigationReading } from '../../games/ship/ShipNavigation.js';
const fmt = (n: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(n);
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}
export class NavigationPanel {
  #select = element('select');
  #scope = element('div');
  #details = element('div');
  #key = '';
  constructor(root: HTMLElement, ship: () => Ship, message: HTMLElement) {
    this.#select.setAttribute('aria-label', 'Navigation destination');
    this.#select.addEventListener('change', () => {
      ship().navigation.selectDestination(this.#select.value || null);
      message.textContent =
        'Navigation destination queued. Run or Single step applies it.';
      message.dataset.error = 'false';
    });
    root.append(this.#select, this.#scope, this.#details);
  }
  paint(reading: Readonly<NavigationReading>, reset = false): void {
    const key = JSON.stringify(reading.contacts.map((c) => [c.id, c.label]));
    if (reset || key !== this.#key) {
      this.#key = key;
      this.#select.replaceChildren(
        new Option('No destination', ''),
        ...reading.contacts.map((c) => new Option(c.label, c.id)),
      );
      this.#select.value = reading.destination?.id ?? '';
    }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 320 320');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Ship-forward navigation scope, 10 kilometre range',
    );
    svg.style.cssText =
      'width:100%;max-width:320px;display:block;margin:12px 0;background:#09171e;border-radius:50%';
    for (const radius of [45, 90, 140]) {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '160');
      circle.setAttribute('cy', '160');
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#284a50');
      svg.append(circle);
    }
    const nose = document.createElementNS(ns, 'path');
    nose.setAttribute('d', 'M160 151 L155 167 L160 164 L165 167 Z');
    nose.setAttribute('fill', '#edbd70');
    svg.append(nose);
    for (const c of reading.contacts.filter((c) => c.distanceM <= 10000)) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(160 + (c.localOffsetM.x / 10000) * 140));
      dot.setAttribute('cy', String(160 - (c.localOffsetM.z / 10000) * 140));
      dot.setAttribute('r', c.id === reading.destination?.id ? '6' : '3');
      dot.setAttribute(
        'fill',
        c.id === reading.destination?.id ? '#edbd70' : '#82dfd1',
      );
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${c.label}: ${fmt(c.distanceM)} m`;
      dot.append(title);
      svg.append(dot);
    }
    this.#scope.replaceChildren(svg);
    const d = reading.destination;
    const facts = [
      `Heading ${fmt(reading.headingDegrees)}° · speed ${fmt(reading.speedMps)} m/s.`,
      `Known beacons within 10 km: ${reading.contacts.filter((c) => c.distanceM <= 10000).length}. Ship forward at top; ship-relative elevation shown separately.`,
    ];
    if (!d) facts.push('No destination selected.');
    else
      facts.push(
        `${d.label} · ${d.arrived ? 'Within arrival radius' : `${fmt(d.distanceM / 1000)} km away`}.`,
        `Bearing ${fmt(d.bearingDegrees)}° · relative ${fmt(d.relativeBearingDegrees)}° · elevation ${fmt(d.elevationDegrees)}°.`,
        `Closing speed ${fmt(d.closingSpeedMps)} m/s · ${d.closingTimeSeconds === null ? 'no closing-time estimate' : `range / closing-rate estimate ${fmt(d.closingTimeSeconds)} s`}.`,
        'Closing time assumes the current closing rate remains constant; it is not an intercept or braking prediction.',
      );
    this.#details.replaceChildren(...facts.map((text) => element('p', text)));
  }
}
