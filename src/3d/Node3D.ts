import type { Mesh3D } from './Mesh3D.js';
import type { Transform3D } from './Transform3D.js';
import {
  identityMatrix,
  multiplyMatrices,
  transformMatrix,
} from './Matrix4.js';
import type { Matrix4 } from './Matrix4.js';

/** Scene-owned data. No registration, clock, DOM listeners or external resources. */
export class Node3D {
  transform: Transform3D = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
  #matrix: Matrix4 | null = null;
  /** Exact imported affine transform. Overrides TRS until cleared. */
  get matrix(): Matrix4 | null {
    return this.#matrix;
  }
  set matrix(value: Matrix4 | null) {
    if (
      value &&
      (value.length !== 16 ||
        !Array.from(value).every(Number.isFinite) ||
        value[3] !== 0 ||
        value[7] !== 0 ||
        value[11] !== 0 ||
        value[15] !== 1)
    )
      throw new Error('Node matrix must be finite and affine');
    this.#matrix = value ? (Object.freeze([...value]) as Matrix4) : null;
  }
  mesh: Mesh3D | null = null;
  visible = true;
  /** Optional shadow backend flags, independent of mesh/material identity. */
  castsShadow = true;
  receivesShadow = true;
  #parent: Node3D | null = null;
  #children = new Set<Node3D>();
  constructor(readonly name = '') {}
  get parent(): Node3D | null {
    return this.#parent;
  }
  get children(): readonly Node3D[] {
    return [...this.#children];
  }

  /** Reparent with local transform preserved. Cycles reject before mutation. */
  add(child: Node3D): this {
    for (
      let ancestor: Node3D | null = this;
      ancestor;
      ancestor = ancestor.#parent
    )
      if (ancestor === child)
        throw new Error('A node hierarchy cannot contain cycles');
    child.#parent?.remove(child);
    this.#children.add(child);
    child.#parent = this;
    return this;
  }
  remove(child: Node3D): this {
    if (this.#children.delete(child)) child.#parent = null;
    return this;
  }
  worldMatrix(): Matrix4 {
    return multiplyMatrices(
      this.#parent?.worldMatrix() ?? identityMatrix,
      this.#matrix ?? transformMatrix(this.transform),
    );
  }
  /** Reads current transforms; no stale world-matrix cache or update ordering contract. */
  traverse(visitor: (node: Node3D, world: Matrix4) => void): void {
    this.#visit(visitor, this.#parent?.worldMatrix() ?? identityMatrix);
  }
  #visit(
    visitor: (node: Node3D, world: Matrix4) => void,
    parent: Matrix4,
  ): void {
    if (!this.visible) return;
    const world = multiplyMatrices(
      parent,
      this.#matrix ?? transformMatrix(this.transform),
    );
    visitor(this, world);
    for (const child of this.#children) child.#visit(visitor, world);
  }
}
