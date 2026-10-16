import { readFile } from 'node:fs/promises';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
interface Step {
  number: number;
  tool: string;
  args: ObjectValue;
  response: ObjectValue;
}
function resultText(value: unknown, prefix = ''): string[] {
  if (object(value))
    return Object.entries(value).flatMap(([key, item]) =>
      resultText(item, prefix ? prefix + '.' + key : key),
    );
  if (Array.isArray(value)) return [`${prefix}: ${value.length} entries`];
  return [`${prefix}: ${String(value)}`];
}
/** Reads the installed CFW-maintained example. No copied call sequence, descriptions or final quest JSON. */
export async function showAuthoringExample(
  tools: readonly Tool[],
  args: Readonly<Record<string, unknown>>,
  validateInput: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => boolean,
): Promise<string> {
  const section = args['section'] ?? 'chain',
    start = args['start'] ?? 1,
    limit = args['limit'] ?? 4;
  if (!['chain', 'steps', 'diagram'].includes(String(section)))
    throw new Error('Unknown example section');
  if (
    !Number.isSafeInteger(start) ||
    (start as number) < 1 ||
    !Number.isSafeInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 8
  )
    throw new Error('Invalid example page; limit is 1–8');
  if (
    section !== 'steps' &&
    (args['start'] !== undefined || args['limit'] !== undefined)
  )
    throw new Error('Use section steps for pagination');
  const source = new URL(
    '../../docs/QUEST-BUILDER-TOOLS-WALKTHROUGH.md',
    import.meta.resolve('cfw-authoring-candidate'),
  );
  const walkthrough = await readFile(source, 'utf8');
  if (Buffer.byteLength(walkthrough) > 262144)
    throw new Error('Authoring example exceeds the supported size');
  const headings = [...walkthrough.matchAll(/^### (\d+)\. `([^`]+)`\s*$/gm)];
  const steps: Step[] = headings.map((heading, i) => {
    const body = walkthrough.slice(
      heading.index! + heading[0].length,
      headings[i + 1]?.index ?? walkthrough.length,
    );
    const input = body.match(/Input:\s*```json\s*([\s\S]*?)```/),
      output = body.match(/Observed response:\s*```json\s*([\s\S]*?)```/);
    if (!input || !output)
      throw new Error(
        'Authoring example format changed; an update is required',
      );
    const parameters: unknown = JSON.parse(input[1]!),
      response: unknown = JSON.parse(output[1]!);
    if (
      !object(parameters) ||
      !object(response) ||
      !['completed', 'rejected'].includes(String(response['status']))
    )
      throw new Error('Invalid authoring example response');
    return {
      number: Number(heading[1]),
      tool: heading[2]!,
      args: parameters,
      response,
    };
  });
  if (!steps.length || steps.some((s, i) => s.number !== i + 1))
    throw new Error('Authoring example has missing or out-of-order steps');
  const available = new Map(tools.map((t) => [t.name, t]));
  if (steps.some((s) => !available.has(s.tool)))
    throw new Error('This example requires unavailable authoring tools');
  for (const step of steps) {
    if (
      step.response['status'] === 'completed' &&
      !validateInput(step.tool, step.args)
    )
      throw new Error(
        `Example step ${step.number} no longer matches the available authoring tool`,
      );
  }
  const diagrams = [...walkthrough.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)];
  // Mermaid labels are already double-quoted; readable single quotes avoid both HTML entities and unescaped label delimiters.
  const diagram = diagrams.at(-1)?.[1]?.trim().replaceAll('&quot;', "'");
  if (!diagram || !/^flowchart /m.test(diagram))
    throw new Error(
      'Authoring example is missing its resulting Mermaid diagram',
    );
  const header =
    'QUEST AUTHORING EXAMPLE\nThis example illustrates the tool calls, explanations, and resulting structure of a branching watchtower quest.\nThe IDs and revisions shown belong to this example.\n';
  function render(step: Step): string {
    const description =
      available.get(step.tool)?.description ??
      'No description supplied by native discovery.';
    const raw = step.response;
    const body = object(raw['data']) ? raw['data'] : raw;
    const fields = [
      'draftId',
      'revision',
      'created',
      'changedId',
      'code',
      'message',
      'publication',
      'technicalReady',
      'findings',
    ];
    const notes = fields
      .filter((key) => body[key] !== undefined)
      .flatMap((key) => resultText(body[key], key))
      .join('; ');
    return `${step.number}. ${step.tool}(${JSON.stringify(step.args)})\n   Explanation: ${description}\n   Result: ${raw['status']}${notes ? '; ' + notes : ''}.${raw['status'] === 'rejected' ? ' Rejected call; the subsequent correction addresses the reported issue.' : ''}`;
  }
  const finalDiagram = `\n\nRESULTING QUEST\nFinal structure after all calls and corrections.\n\n\`\`\`mermaid\n${diagram}\n\`\`\``;
  if (section === 'diagram') return header + finalDiagram;
  if (section === 'steps') {
    if ((start as number) > steps.length)
      throw new Error(`Example has ${steps.length} steps`);
    const page = steps.slice(
      (start as number) - 1,
      (start as number) - 1 + (limit as number),
    );
    const next = (start as number) + page.length;
    return (
      header +
      `\nCONSECUTIVE CALLS ${start}–${next - 1}\n` +
      page.map(render).join('\n\n') +
      `\n\nNext: ${next <= steps.length ? `show_authoring_example({section: "steps", start: ${next}, limit: ${limit}})` : 'end of example'}.` +
      finalDiagram
    );
  }
  return (
    header +
    '\nCOMPLETE TOOL-CALL CHAIN\nThe calls are shown in execution order, including rejected calls and their corrections.\n\n' +
    steps.map(render).join('\n\n') +
    finalDiagram
  );
}
