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
    interact: { kind: 'press', mapping: 'KeyE' },
    fire: { kind: 'hold', mapping: 'Mouse0' },
    reset: { kind: 'press', mapping: { code: 'KeyR', modifiers: ['Control'] } },
  },
};
