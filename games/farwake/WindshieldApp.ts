import type { CrewCallVideo } from './CrewCallVideo.js';
import { initialCrewKnowledge, paginateBiography } from './CrewBiography.js';
import type { BiographyPage } from './CrewBiography.js';
import { crewPlaceholderStats, crewIds } from './CrewProfiles.js';
import type { CrewProfile } from './CrewProfiles.js';
import { DynamicTextureImage } from '../../src/3d/index.js';

export const windshieldPages = ['Ship', 'Map', 'Crew', '...'] as const;
export interface CrewPortrait {
  readonly profile: Readonly<CrewProfile>;
  readonly image: ImageBitmap;
}
const width = 2048,
  height = 1408;
const tabs = { left: 319, top: 100, width: 330, height: 90, gap: 30 };

type CrewControl =
  | { kind: 'details' | 'call'; member: number }
  | { kind: 'back' | 'previous' | 'next' };
const crewButtons = {
  details: { x: tabs.left, y: 995, width: tabs.width, height: 65 },
  call: { x: tabs.left, y: 1080, width: tabs.width, height: 65 },
  back: { x: tabs.left, y: 245, width: 240, height: 65 },
  previous: { x: 740, y: 985, width: 240, height: 65 },
  next: { x: 1450, y: 985, width: 230, height: 65 },
};
export function crewControlAt(
  u: number,
  v: number,
  details: boolean,
): CrewControl | null {
  const x = u * width,
    y = (1 - v) * height;
  const inside = (r: { x: number; y: number; width: number; height: number }) =>
    x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  if (details) {
    for (const kind of ['back', 'previous', 'next'] as const)
      if (inside(crewButtons[kind])) return { kind };
  } else {
    for (let member = 0; member < crewIds.length; member++)
      if (
        inside({
          ...crewButtons.details,
          x: tabs.left + member * (tabs.width + tabs.gap),
        })
      )
        return { kind: 'details', member };
    for (let member = 0; member < crewIds.length; member++)
      if (
        inside({
          ...crewButtons.call,
          x: tabs.left + member * (tabs.width + tabs.gap),
        })
      )
        return { kind: 'call', member };
  }
  return null;
}

export const callFrame = { x: tabs.left, y: 390, size: 690 };
const callEnd = { x: tabs.left, y: 1110, width: 300, height: 65 };
const dialogueChoices = [
  'How are things over there?',
  'Does the crew need anything?',
  'I will let you get back to work.',
] as const;
export function commsControlAt(u: number, v: number): 'end' | number | null {
  const x = u * width,
    y = (1 - v) * height;
  if (
    x >= callEnd.x &&
    x <= callEnd.x + callEnd.width &&
    y >= callEnd.y &&
    y <= callEnd.y + callEnd.height
  )
    return 'end';
  if (x < 1170 || x > 1730) return null;
  for (let choice = 0; choice < dialogueChoices.length; choice++)
    if (y >= 390 + choice * 150 && y <= 510 + choice * 150) return choice;
  return null;
}

/** Numbered navigation is local to the windshield, separate from flight commands. */
export class WindshieldPages {
  #selected = 0;
  get selected(): number {
    return this.#selected;
  }
  select(index: number): void {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= windshieldPages.length
    )
      throw new Error('Invalid windshield page');
    this.#selected = index;
  }
  /** Authored pane UV has its origin at the bottom-left. */
  hit(u: number, v: number): number | null {
    const x = u * width,
      y = (1 - v) * height;
    if (y < tabs.top || y > tabs.top + tabs.height) return null;
    for (let i = 0; i < windshieldPages.length; i++) {
      const left = tabs.left + i * (tabs.width + tabs.gap);
      if (x >= left && x <= left + tabs.width) return i;
    }
    return null;
  }
}

/** One canvas texture on the authored glass; redraw only when changing pages. */
export class WindshieldApp {
  readonly pages = new WindshieldPages();
  readonly image: DynamicTextureImage;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly biographies: readonly (readonly BiographyPage[])[];
  #detail: { member: number; page: number } | null = null;
  #calling = false;
  #choice: number | null = null;
  #callMember = 0;
  constructor(
    private readonly portraits: readonly CrewPortrait[],
    private readonly callVideo: CrewCallVideo,
  ) {
    if (portraits.length !== crewIds.length)
      throw new Error('Windshield requires four crew portraits');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Windshield canvas unavailable');
    this.ctx = ctx;
    ctx.font = '28px monospace';
    this.biographies = portraits.map(({ profile }) => {
      const unlocked = initialCrewKnowledge[profile.id];
      if (!unlocked)
        throw new Error(`Missing initial crew knowledge: ${profile.id}`);
      return paginateBiography(
        profile,
        unlocked,
        (text) => ctx.measureText(text).width,
        1000,
        14,
      );
    });
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    this.image = new DynamicTextureImage(width, height, pixels);
    this.draw();
  }
  select(index: number): void {
    if (index === this.pages.selected && !this.#detail && !this.#calling)
      return;
    this.pages.select(index);
    this.#detail = null;
    this.#calling = false;
    this.callVideo.stop();
    this.draw();
  }
  click(u: number, v: number): void {
    const page = this.pages.hit(u, v);
    if (page !== null) {
      this.select(page);
      return;
    }
    if (this.pages.selected !== 2) return;
    if (this.#calling) {
      const action = commsControlAt(u, v);
      if (action === 'end') this.back();
      else if (typeof action === 'number') {
        this.#choice = action;
        this.draw();
      }
      return;
    }
    const control = crewControlAt(u, v, this.#detail !== null);
    if (!control) return;
    if (control.kind === 'call') {
      this.#callMember = control.member;
      this.#calling = true;
      this.#choice = null;
      this.callVideo.start(this.portraits[control.member]!.profile.id);
    } else if (control.kind === 'details')
      this.#detail = { member: control.member, page: 0 };
    else if (control.kind === 'back') {
      this.back();
      return;
    } else if (this.#detail) {
      const count = this.biographies[this.#detail.member]!.length;
      const next = this.#detail.page + (control.kind === 'next' ? 1 : -1);
      if (next < 0 || next >= count) return;
      this.#detail.page = next;
    }
    this.draw();
  }
  /** Back out one subsystem level before closing the windshield itself. */
  back(): boolean {
    if (this.#calling) {
      this.#calling = false;
      this.callVideo.stop();
      this.draw();
      return true;
    }
    if (!this.#detail) return false;
    this.#detail = null;
    this.draw();
    return true;
  }
  setVisible(visible: boolean): void {
    this.callVideo.setVisible(visible);
  }
  update(): void {
    if (this.#calling) this.callVideo.changed();
  }
  get callProjection() {
    return this.#calling ? this.callVideo.image : null;
  }
  private drawCall(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(
      this.portraits[this.#callMember]!.profile.fullName,
      tabs.left,
      280,
    );
    ctx.font = '24px monospace';
    ctx.fillStyle = '#a6adb1';
    ctx.fillText('COMMS PREVIEW', tabs.left, 330);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(callFrame.x, callFrame.y, callFrame.size, callFrame.size);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = '24px monospace';
    ctx.fillText('DIALOGUE PREVIEW', 1170, 345);
    dialogueChoices.forEach((label, index) => {
      const top = 390 + index * 150;
      const selected = this.#choice === index;
      ctx.strokeStyle = '#ffffff';
      if (selected) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1170, top, 560, 120);
      } else ctx.strokeRect(1170, top, 560, 120);
      ctx.fillStyle = selected ? '#000000' : '#ffffff';
      ctx.font = '25px monospace';
      ctx.textAlign = 'left';
      // Short placeholder choices fit two measured lines at this preview width.
      const words = `${index + 1}. ${label}`.split(' ');
      let line = '',
        row = 0;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > 510) {
          ctx.fillText(line, 1195, top + 42 + row++ * 35);
          line = word;
        } else line = next;
      }
      if (line) ctx.fillText(line, 1195, top + 42 + row * 35);
    });
    this.button('End call', callEnd);
  }
  private button(
    label: string,
    rect: { x: number; y: number; width: number; height: number },
    enabled = true,
  ): void {
    const ctx = this.ctx;
    ctx.strokeStyle = ctx.fillStyle = enabled ? '#ffffff' : '#51585c';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.textAlign = 'center';
    ctx.font = '27px monospace';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
  private drawDetails(member: number, index: number): void {
    const ctx = this.ctx,
      portrait = this.portraits[member]!;
    const pages = this.biographies[member]!,
      page = pages[index];
    this.button('Back to crew', crewButtons.back);
    ctx.save();
    ctx.filter = 'saturate(25%)';
    ctx.drawImage(portrait.image, tabs.left, 365, 300, 300);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(portrait.profile.fullName, 700, 280, 1000);
    ctx.font = '26px monospace';
    ctx.fillText(portrait.profile.role, 700, 325, 1000);
    ctx.font = 'bold 28px monospace';
    ctx.fillText(page?.title ?? 'Biography', 700, 380, 1000);
    ctx.font = '28px monospace';
    const lines = page?.lines ?? ['No biography sections unlocked yet.'];
    lines.forEach((line, row) => ctx.fillText(line, 700, 435 + row * 36));
    this.button('Previous', crewButtons.previous, index > 0);
    this.button('Next', crewButtons.next, index + 1 < pages.length);
    ctx.fillStyle = '#ffffff';
    ctx.font = '25px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${index + 1} / ${Math.max(1, pages.length)}`, 1210, 1017);
  }
  private draw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#080b0e';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 3;
    ctx.font = '32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    windshieldPages.forEach((label, i) => {
      const x = tabs.left + i * (tabs.width + tabs.gap);
      const active = i === this.pages.selected;
      ctx.strokeStyle = '#ffffff';
      if (active) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, tabs.top, tabs.width, tabs.height);
      } else ctx.strokeRect(x, tabs.top, tabs.width, tabs.height);
      ctx.fillStyle = active ? '#000000' : '#ffffff';
      ctx.fillText(
        `${i + 1}. ${label}`,
        x + tabs.width / 2,
        tabs.top + tabs.height / 2,
      );
    });
    if (this.pages.selected === 2 && this.#calling) {
      this.drawCall();
    } else if (this.pages.selected === 2 && this.#detail) {
      this.drawDetails(this.#detail.member, this.#detail.page);
    } else if (this.pages.selected === 2) {
      ctx.save();
      ctx.filter = 'saturate(25%)';
      this.portraits.forEach((portrait, i) => {
        const x = tabs.left + i * (tabs.width + tabs.gap);
        ctx.drawImage(portrait.image, x, 310, tabs.width, tabs.width);
      });
      ctx.restore();
      this.portraits.forEach(({ profile }, i) => {
        const x = tabs.left + i * (tabs.width + tabs.gap);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(x, 310, tabs.width, tabs.width);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px monospace';
        ctx.fillText(profile.displayName, x + tabs.width / 2, 685, tabs.width);
        ctx.font = '25px monospace';
        ctx.fillText(profile.role, x + tabs.width / 2, 731, tabs.width);
        ctx.font = '21px monospace';
        ctx.fillStyle = '#a6adb1';
        ctx.fillText('PLACEHOLDER STATS', x + tabs.width / 2, 793, tabs.width);
        ctx.font = '25px monospace';
        ctx.fillStyle = '#ffffff';
        this.button('Details', { ...crewButtons.details, x });
        this.button('Call', { ...crewButtons.call, x }, true);
        ctx.font = '25px monospace';
        crewPlaceholderStats.forEach(({ label, value }, row) => {
          const y = 846 + row * 48;
          ctx.textAlign = 'left';
          ctx.fillText(label, x + 12, y);
          ctx.textAlign = 'right';
          ctx.fillText(`${value}%`, x + tabs.width - 12, y);
        });
      });
    }
    // The authored glass UV runs bottom-to-top; texture rows run top-to-bottom.
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const pixels = new Uint8Array(rgba.length);
    const stride = width * 4;
    for (let row = 0; row < height; row++)
      pixels.set(
        rgba.subarray(row * stride, (row + 1) * stride),
        (height - row - 1) * stride,
      );
    this.image.update(pixels);
  }
}
