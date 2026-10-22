import type { CrewProfile } from './CrewProfiles.js';

/** Initial game knowledge; later progression/save state supplies these section IDs. */
export const initialCrewKnowledge: Readonly<Record<string, readonly string[]>> =
  {
    sera: ['what-the-crew-knows-from-the-beginning'],
    ren: ['what-the-crew-already-knows'],
    nadia: ['known-from-the-beginning'],
    bram: ['what-the-crew-knows-from-the-beginning'],
  };
export interface BiographyPage {
  readonly sectionId: string;
  readonly title: string;
  readonly lines: readonly string[];
}
/** Render prose without author citations, Markdown decorations or repository navigation. */
export function biographyProse(markdown: string): string {
  return markdown
    .split('\n')
    .filter(
      (line) =>
        !/^\s*>/.test(line) && !/\]\((?:README|crew-dynamics)\.md/.test(line),
    )
    .join('\n')
    .replace(/\([^)]*#\d+[^)]*\)/g, '')
    .replace(
      /\b(?:Ivy|Gadget|Oscar|Luna|Julien)\b[^.!?\n]*#\d+[^.!?\n]*[.!?]?/g,
      '',
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/ +:/g, ':')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
/** Filter before pagination: locked text and titles never enter the display's page model. */
export function paginateBiography(
  profile: Readonly<CrewProfile>,
  unlockedIds: readonly string[],
  measure: (text: string) => number,
  maxWidth: number,
  linesPerPage: number,
): readonly BiographyPage[] {
  if (
    !Number.isFinite(maxWidth) ||
    maxWidth <= 0 ||
    !Number.isInteger(linesPerPage) ||
    linesPerPage < 1
  )
    throw new Error('Invalid biography page dimensions');
  const unlocked = new Set(unlockedIds);
  const existing = new Set(profile.biographySections.map((s) => s.id));
  if (
    unlocked.size !== unlockedIds.length ||
    unlockedIds.some((id) => !existing.has(id))
  )
    throw new Error(`Invalid biography unlocks for ${profile.id}`);
  const pages: BiographyPage[] = [];
  for (const section of profile.biographySections) {
    if (!unlocked.has(section.id)) continue;
    const prose = biographyProse(section.markdown);
    if (!prose) continue;
    const lines: string[] = [];
    for (const paragraph of prose.split(/\n\s*\n/)) {
      if (lines.length) lines.push('');
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = '';
        }
        // Long unbroken terms must also fit, without silently dropping characters.
        for (const character of word) {
          if (measure(character) > maxWidth)
            throw new Error('Biography width cannot fit a character');
          if (line && measure(line + character) > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      }
      if (line) lines.push(line);
    }
    for (let offset = 0; offset < lines.length; offset += linesPerPage)
      pages.push(
        Object.freeze({
          sectionId: section.id,
          title: section.title,
          lines: Object.freeze(lines.slice(offset, offset + linesPerPage)),
        }),
      );
  }
  return Object.freeze(pages);
}
