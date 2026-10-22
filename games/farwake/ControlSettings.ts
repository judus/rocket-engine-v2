import { normalizeInputBinding } from '../../src/Input.js';
import type { InputBinding, InputButton } from '../../src/Input.js';
import type { InputPreset } from '../../src/ActionContext.js';

/** The game chooses exposed controls; the engine owns action dispatch/remapping. */
export const controls = [
  ['forward', 'Forward', 'KeyW'],
  ['reverse', 'Reverse', 'KeyS'],
  ['right', 'Strafe right', 'KeyD'],
  ['left', 'Strafe left', 'KeyA'],
  ['up', 'Thrust up', 'AltLeft'],
  ['down', 'Thrust down', ['ControlLeft', 'ControlRight']],
  ['yawRight', 'Yaw right', 'ArrowRight'],
  ['yawLeft', 'Yaw left', 'ArrowLeft'],
  ['pitchUp', 'Pitch up', 'ArrowUp'],
  ['pitchDown', 'Pitch down', 'ArrowDown'],
  ['rollRight', 'Roll right', 'KeyE'],
  ['rollLeft', 'Roll left', 'KeyQ'],
  ['fire', 'Fire', ['Space', 'Mouse0']],
  ['dampers', 'Inertia dampers', 'KeyX'],
  ['systems', 'Cockpit displays', 'KeyI'],
  ...Array.from(
    { length: 6 },
    (_, i) =>
      [`group${i + 1}`, `Weapon group ${i + 1}`, `Digit${i + 1}`] as const,
  ),
] as const;
export interface ControlSettings {
  steering: 'keyboard' | 'mouse';
  sensitivity: number;
  invertPitch: boolean;
  virtual: 'auto' | 'off' | 'analog' | 'digital';
  bindings: Record<string, InputBinding>;
}
export const settingsKey = 'rocket.first-flight.controls';
export function defaultControls(): ControlSettings {
  return {
    steering: 'mouse',
    sensitivity: 1,
    invertPitch: false,
    virtual: 'auto',
    bindings: Object.fromEntries(
      controls.map(([id, , binding]) => [id, structuredClone(binding)]),
    ),
  };
}
export function validateControls(value: unknown): ControlSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Control settings must be an object');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !==
      ['bindings', 'invertPitch', 'sensitivity', 'steering', 'virtual']
        .sort()
        .join() ||
    !['mouse', 'keyboard'].includes(String(v.steering)) ||
    typeof v.sensitivity !== 'number' ||
    !Number.isFinite(v.sensitivity) ||
    v.sensitivity < 0.1 ||
    v.sensitivity > 3 ||
    typeof v.invertPitch !== 'boolean' ||
    !['auto', 'off', 'analog', 'digital'].includes(String(v.virtual)) ||
    !v.bindings ||
    typeof v.bindings !== 'object' ||
    Array.isArray(v.bindings)
  )
    throw new Error('Invalid control settings');
  const bindings = v.bindings as Record<string, InputBinding>;
  if (
    Object.keys(bindings).sort().join() !==
    controls
      .map(([id]) => id)
      .sort()
      .join()
  )
    throw new Error('Control bindings do not match this game');
  const assigned = new Map<string, string>();
  for (const [id, label] of controls) {
    for (const button of normalizeInputBinding(bindings[id]!)) {
      if (
        button.code === 'KeyC' ||
        (button.code === 'KeyT' && button.modifiers.length === 0) ||
        button.code === 'Mouse2' ||
        !/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Intl(Backslash|Ro|Yen)|F([1-9]|1[0-9]|2[0-4])|Numpad\w+|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote|Mouse[0-4])$/.test(
          button.code,
        )
      )
        throw new Error(
          `${label}: unsupported key. Escape is reserved for the menu; C and right mouse toggle mouse steering; T cycles targets.`,
        );
      const key = `${button.code}:${[...button.modifiers].sort().join('+')}`;
      const previous = assigned.get(key);
      if (previous)
        throw new Error(
          `${label} conflicts with ${previous}. Choose another binding.`,
        );
      assigned.set(key, label);
    }
  }
  return structuredClone(value) as ControlSettings;
}
export function readControls(
  storage: Pick<Storage, 'getItem'>,
): ControlSettings {
  const saved = storage.getItem(settingsKey);
  return saved === null
    ? defaultControls()
    : validateControls(JSON.parse(saved) as unknown);
}
export function saveControls(
  storage: Pick<Storage, 'setItem'>,
  value: unknown,
): ControlSettings {
  const settings = validateControls(value);
  storage.setItem(settingsKey, JSON.stringify(settings));
  return settings;
}
/** Resolve device policy without replacing the user's persisted choice. */
export function virtualMode(
  settings: ControlSettings,
  touchFirst: boolean,
): 'off' | 'analog' | 'digital' {
  return settings.virtual === 'auto'
    ? touchFirst
      ? 'analog'
      : 'off'
    : settings.virtual;
}
export function controlPreset(
  settings: ControlSettings,
  touchFirst = false,
): InputPreset {
  const b = settings.bindings;
  const axis = (negative: string, positive: string) => ({
    kind: 'axis' as const,
    mapping: { negative: b[negative]!, positive: b[positive]! },
  });
  return {
    capture:
      settings.steering === 'mouse' &&
      virtualMode(settings, touchFirst) === 'off'
        ? 'pointer-lock'
        : 'focus',
    actions: {
      forward: axis('reverse', 'forward'),
      right: axis('left', 'right'),
      up: axis('down', 'up'),
      yaw: axis('yawLeft', 'yawRight'),
      pitch: axis('pitchDown', 'pitchUp'),
      roll: axis('rollLeft', 'rollRight'),
      lookX: { kind: 'axis', mapping: { pointer: 'x', scale: 1 } },
      lookY: { kind: 'axis', mapping: { pointer: 'y', scale: 1 } },
      fire: { kind: 'hold', mapping: b.fire! },
    },
  };
}
export function bindingLabel(binding: InputBinding): string {
  const name = (button: InputButton) =>
    typeof button === 'string'
      ? button
      : [...button.modifiers, button.code].join(' + ');
  return (Array.isArray(binding) ? binding : [binding])
    .map(name)
    .join(' / ')
    .replaceAll('Key', '')
    .replaceAll('Digit', '')
    .replaceAll('Mouse0', 'Left mouse')
    .replaceAll('Mouse1', 'Middle mouse')
    .replaceAll('Mouse2', 'Right mouse');
}
