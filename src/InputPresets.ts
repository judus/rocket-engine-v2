import type { VirtualLayout, VirtualCorner } from './VirtualController.js';
import type { InputPreset } from './ActionContext.js';
/** Bindings and action semantics only; movement/physics remain game-owned. */
export const firstPersonInput: InputPreset = {
  capture: 'pointer-lock',
  actions: {
    forward: { kind: 'axis', mapping: { negative: 'KeyS', positive: 'KeyW' } },
    right: { kind: 'axis', mapping: { negative: 'KeyA', positive: 'KeyD' } },
    lookX: { kind: 'axis', mapping: { pointer: 'x', scale: 0.003 } },
    lookY: { kind: 'axis', mapping: { pointer: 'y', scale: 0.003 } },
    turn: {
      kind: 'axis',
      mapping: { negative: 'ArrowLeft', positive: 'ArrowRight' },
    },
    tilt: {
      kind: 'axis',
      mapping: { negative: 'ArrowDown', positive: 'ArrowUp' },
    },
    sprint: { kind: 'hold', mapping: ['ShiftLeft', 'ShiftRight'] },
    crouch: { kind: 'hold', mapping: ['ControlLeft', 'ControlRight'] },
    jump: { kind: 'press', mapping: 'Space' },
    reload: { kind: 'press', mapping: 'KeyR' },
    fire: { kind: 'hold', mapping: 'Mouse0' },
    interact: { kind: 'press', mapping: 'KeyF' },
    health: { kind: 'press', mapping: 'Tab' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};
export const topDownInput: InputPreset = {
  capture: 'focus',
  actions: {
    north: {
      kind: 'axis',
      mapping: {
        negative: ['KeyS', 'ArrowDown'],
        positive: ['KeyW', 'ArrowUp'],
      },
    },
    east: {
      kind: 'axis',
      mapping: {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
      },
    },
    sprint: { kind: 'hold', mapping: ['ShiftLeft', 'ShiftRight'] },
    fire: { kind: 'hold', mapping: 'Space' },
    interact: { kind: 'press', mapping: 'KeyF' },
    health: { kind: 'press', mapping: 'Tab' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};

/** Side-view movement: height comes from game-owned jumping, never a north axis. */
export const platformerInput: InputPreset = {
  capture: 'focus',
  actions: {
    horizontal: {
      kind: 'axis',
      mapping: {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
      },
    },
    sprint: { kind: 'hold', mapping: ['ShiftLeft', 'ShiftRight'] },
    jump: { kind: 'press', mapping: ['Space', 'ArrowUp'] },
    attack: { kind: 'press', mapping: ['ControlRight', 'Mouse0'] },
    interact: { kind: 'press', mapping: 'KeyF' },
    health: { kind: 'press', mapping: 'Tab' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};

/** Belt-scroller: ground depth and jump height are independent intentions. */
export const beltScrollerInput: InputPreset = {
  capture: 'focus',
  actions: {
    horizontal: {
      kind: 'axis',
      mapping: {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
      },
    },
    depth: {
      kind: 'axis',
      mapping: {
        negative: ['KeyS', 'ArrowDown'],
        positive: ['KeyW', 'ArrowUp'],
      },
    },
    sprint: { kind: 'hold', mapping: ['ShiftLeft', 'ShiftRight'] },
    jump: { kind: 'press', mapping: 'Space' },
    attack: { kind: 'press', mapping: ['ControlRight', 'Mouse0'] },
    interact: { kind: 'press', mapping: 'KeyF' },
    health: { kind: 'press', mapping: 'Tab' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};

/** Free-flight intentions; the game chooses inertia, speed and orientation rules. */
export const flightInput: InputPreset = {
  capture: 'focus',
  actions: {
    forward: { kind: 'axis', mapping: { negative: 'KeyS', positive: 'KeyW' } },
    right: { kind: 'axis', mapping: { negative: 'KeyA', positive: 'KeyD' } },
    up: {
      kind: 'axis',
      mapping: {
        negative: ['ControlLeft', 'ControlRight'],
        positive: 'AltLeft',
      },
    },
    yaw: {
      kind: 'axis',
      mapping: { negative: 'ArrowLeft', positive: 'ArrowRight' },
    },
    pitch: {
      kind: 'axis',
      mapping: { negative: 'ArrowDown', positive: 'ArrowUp' },
    },
    roll: { kind: 'axis', mapping: { negative: 'KeyQ', positive: 'KeyE' } },
    lookX: { kind: 'axis', mapping: { pointer: 'x', scale: 0.003 } },
    lookY: { kind: 'axis', mapping: { pointer: 'y', scale: 0.003 } },
    fire: { kind: 'hold', mapping: ['Space', 'Mouse0'] },
    boost: { kind: 'hold', mapping: ['ShiftLeft', 'ShiftRight'] },
    interact: { kind: 'press', mapping: 'KeyF' },
    health: { kind: 'press', mapping: 'Tab' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};

/** Touch templates map directly to intentions, never to physical key codes. */
export const virtualInputLayouts = {
  'first-person': {
    sticks: [
      { label: 'Move', x: 'right', y: 'forward' },
      { label: 'Look', x: 'turn', y: 'tilt' },
    ],
    buttons: [
      { label: 'Run', action: 'sprint' },
      { label: 'Crouch', action: 'crouch' },
      { label: 'Jump', action: 'jump' },
      { label: 'Fire', action: 'fire' },
      { label: 'Reload', action: 'reload' },
      { label: 'Interact', action: 'interact' },
      { label: 'Health', action: 'health' },
    ],
  },
  'top-down': {
    sticks: [{ label: 'Move', x: 'east', y: 'north' }],
    buttons: [
      { label: 'Run', action: 'sprint' },
      { label: 'Fire', action: 'fire' },
      { label: 'Interact', action: 'interact' },
      { label: 'Health', action: 'health' },
    ],
  },
  platformer: {
    sticks: [{ label: 'Move', x: 'horizontal' }],
    buttons: [
      { label: 'Run', action: 'sprint' },
      { label: 'Jump', action: 'jump' },
      { label: 'Attack', action: 'attack' },
      { label: 'Interact', action: 'interact' },
      { label: 'Health', action: 'health' },
    ],
  },
  'belt-scroller': {
    sticks: [{ label: 'Move', x: 'horizontal', y: 'depth' }],
    buttons: [
      { label: 'Run', action: 'sprint' },
      { label: 'Jump', action: 'jump' },
      { label: 'Attack', action: 'attack' },
      { label: 'Interact', action: 'interact' },
      { label: 'Health', action: 'health' },
    ],
  },
  flight: {
    sticks: [
      { label: 'Thrust', x: 'right', y: 'forward' },
      { label: 'Rotate', x: 'yaw', y: 'pitch' },
    ],
    buttons: [
      { label: 'Up', action: 'up' },
      { label: 'Down', action: 'up', value: -1 },
      { label: 'Roll left', action: 'roll', value: -1 },
      { label: 'Roll right', action: 'roll' },
      { label: 'Boost', action: 'boost' },
      { label: 'Fire', action: 'fire' },
      { label: 'Interact', action: 'interact' },
      { label: 'Health', action: 'health' },
    ],
  },
} satisfies Record<string, VirtualLayout>;

/** A compact starting point; override its pads/groups or mount your own components. */
export function createVirtualCornerPreset(
  layout: VirtualLayout,
  mode: 'analog' | 'digital' = 'analog',
): { left: VirtualCorner; right: VirtualCorner } {
  const first = layout.sticks?.[0];
  if (!first) throw new Error('Corner preset needs a movement pad');
  const buttons = layout.buttons ?? [],
    second = layout.sticks?.[1];
  return {
    left: {
      side: 'left',
      pad: { ...first, mode },
      above: [
        {
          label: 'Left upper actions',
          buttons: buttons.slice(0, second ? 2 : 1),
          columns: second ? 2 : 1,
        },
      ],
      inside: second
        ? [
            {
              label: 'Left inner actions',
              buttons: buttons.slice(2, 4),
              columns: 1,
            },
          ]
        : [],
    },
    right: second
      ? {
          side: 'right',
          pad: { ...second, mode },
          above: [
            {
              label: 'Right upper actions',
              buttons: buttons.slice(4, 6),
              columns: 2,
            },
          ],
          inside: [
            {
              label: 'Right inner actions',
              buttons: buttons.slice(6),
              columns: 1,
            },
          ],
        }
      : {
          side: 'right',
          face: {
            label: 'Primary actions',
            buttons: buttons.slice(1),
            columns: 2,
          },
        },
  };
}
export const virtualCornerLayouts = {
  'first-person': createVirtualCornerPreset(
    virtualInputLayouts['first-person'],
  ),
  'top-down': createVirtualCornerPreset(
    virtualInputLayouts['top-down'],
    'digital',
  ),
  platformer: createVirtualCornerPreset(
    virtualInputLayouts.platformer,
    'digital',
  ),
  'belt-scroller': createVirtualCornerPreset(
    virtualInputLayouts['belt-scroller'],
    'digital',
  ),
  flight: createVirtualCornerPreset(virtualInputLayouts.flight),
};
