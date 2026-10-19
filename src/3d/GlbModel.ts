import { readGlbContainer } from './GlbContainer.js';
import { TextureImage } from './TextureImage.js';
import type {
  TextureBinding3D,
  TextureWrap,
  TextureFilter,
} from './TextureImage.js';
import { Mesh3D, MeshGeometry } from './Mesh3D.js';
import type { Material3D } from './Mesh3D.js';
import { Node3D } from './Node3D.js';
import type { Matrix4 } from './Matrix4.js';

export interface GlbCamera {
  readonly node: Node3D;
  readonly name: string;
  readonly yfov: number;
  readonly near: number;
  readonly far: number;
  readonly aspectRatio?: number;
}
export interface GlbInstance {
  readonly root: Node3D;
  readonly nodes: readonly Node3D[];
  readonly cameras: readonly GlbCamera[];
}
export interface GlbModel {
  readonly name: string;
  readonly triangles: number;
  readonly vertices: number;
  readonly meshCount: number;
  /** Fresh placement/hierarchy, immutable meshes shared across instances. No external resources. */
  instantiate(): GlbInstance;
}
type RecordValue = Record<string, unknown>;
function fail(message: string): never {
  throw new Error(`GLB: ${message}`);
}
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('expected object');
  return value as RecordValue;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail('expected array');
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    fail('invalid integer');
  return value;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail('invalid finite number');
  return value;
}
function vector(value: unknown, length: number): number[] {
  const result = list(value).map(finite);
  if (result.length !== length) fail('invalid vector length');
  return result;
}
function name(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
function at(values: unknown[], index: unknown): RecordValue {
  return object(values[integer(index)] ?? fail('index out of range'));
}
function absent(record: RecordValue, keys: string[]): void {
  for (const key of keys)
    if (record[key] !== undefined) fail(`unsupported ${key}`);
}
function unit(value: unknown): number {
  const v = finite(value);
  if (v < 0 || v > 1) fail('factor outside 0..1');
  return v;
}
function nodeMatrix(node: RecordValue): Matrix4 {
  if (node.matrix !== undefined) {
    absent(node, ['translation', 'rotation', 'scale']);
    const matrix = vector(node.matrix, 16) as unknown as Matrix4;
    if (
      matrix[3] !== 0 ||
      matrix[7] !== 0 ||
      matrix[11] !== 0 ||
      matrix[15] !== 1
    )
      fail('node matrix must be affine');
    return matrix;
  }
  const [x, y, z, w] = vector(node.rotation ?? [0, 0, 0, 1], 4) as [
    number,
    number,
    number,
    number,
  ];
  if (Math.abs(Math.hypot(x, y, z, w) - 1) > 0.0001)
    fail('rotation quaternion must be unit length');
  const [sx, sy, sz] = vector(node.scale ?? [1, 1, 1], 3) as [
    number,
    number,
    number,
  ];
  const [tx, ty, tz] = vector(node.translation ?? [0, 0, 0], 3) as [
    number,
    number,
    number,
  ];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
/** Self-contained GLB 2.0 triangle scenes. Explicit subset; unsupported features reject. */
export function parseGlb(
  buffer: ArrayBuffer,
  options: {
    readonly resolveImage?: (
      index: number,
      colorSpace: 'srgb' | 'linear',
    ) => TextureImage;
  } = {},
): GlbModel {
  const { document: json, binary } = readGlbContainer(buffer);
  const doc = object(json),
    asset = object(doc.asset);
  if (
    asset.version !== '2.0' ||
    (asset.minVersion !== undefined && asset.minVersion !== '2.0')
  )
    fail('unsupported asset version');
  for (const key of [
    'extensionsRequired',
    'extensionsUsed',
    'animations',
    'skins',
    ...(options.resolveImage ? [] : ['textures', 'images']),
  ])
    if (doc[key] !== undefined && list(doc[key]).length)
      fail(`unsupported ${key}`);
  absent(doc, ['extensions']);
  const buffers = list(doc.buffers),
    views = list(doc.bufferViews),
    accessors = list(doc.accessors);
  if (buffers.length !== 1 || !binary) fail('one embedded BIN buffer required');
  const source = object(buffers[0]);
  absent(source, ['uri']);
  const binaryLength = integer(source.byteLength, 1);
  if (binary.byteLength < binaryLength || binary.byteLength - binaryLength > 3)
    fail('invalid buffer length');
  const bin = binary;
  function accessor(
    index: unknown,
    type: 'VEC4' | 'VEC3' | 'VEC2' | 'SCALAR',
    indices = false,
  ): number[][] {
    const a = at(accessors, index);
    absent(a, ['sparse', 'extensions']);
    if (
      a.type !== type ||
      (a.normalized !== undefined && a.normalized !== false)
    )
      fail('unsupported accessor type/normalization');
    const component = integer(a.componentType),
      bytes =
        component === 5126 || component === 5125
          ? 4
          : component === 5123
            ? 2
            : component === 5121
              ? 1
              : 0;
    if (
      !bytes ||
      (indices ? ![5121, 5123, 5125].includes(component) : component !== 5126)
    )
      fail('unsupported component type');
    const count = integer(a.count, 1),
      size =
        type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
    const view = at(views, a.bufferView);
    if (integer(view.buffer) !== 0) fail('external buffer');
    const start = integer(view.byteOffset ?? 0),
      length = integer(view.byteLength, 1),
      local = integer(a.byteOffset ?? 0),
      stride = integer(view.byteStride ?? size * bytes, 1);
    if (
      stride < size * bytes ||
      stride % bytes ||
      (view.byteStride !== undefined &&
        (stride < 4 || stride > 252 || stride % 4 || indices)) ||
      local % bytes ||
      (start + local) % bytes ||
      start + length > binaryLength ||
      local + (count - 1) * stride + size * bytes > length
    )
      fail('accessor exceeds bounds or is misaligned');
    return Array.from({ length: count }, (_, i) =>
      Array.from({ length: size }, (_, j) => {
        const position = start + local + i * stride + j * bytes;
        return finite(
          component === 5126
            ? bin.getFloat32(position, true)
            : component === 5125
              ? bin.getUint32(position, true)
              : component === 5123
                ? bin.getUint16(position, true)
                : bin.getUint8(position),
        );
      }),
    );
  }
  const imageSources = options.resolveImage ? embeddedGlbImages(buffer) : [];
  const textures = doc.textures === undefined ? [] : list(doc.textures),
    samplers = doc.samplers === undefined ? [] : list(doc.samplers);
  function binding(
    info: unknown,
    colorSpace: 'srgb' | 'linear',
  ): TextureBinding3D {
    if (!options.resolveImage) fail('texture decoder is required');
    const ref = object(info);
    absent(ref, ['extensions']);
    if (integer(ref.texCoord ?? 0) !== 0) fail('only TEXCOORD_0 supported');
    const tex = at(textures, ref.index);
    absent(tex, ['extensions']);
    const imageIndex = integer(tex.source);
    if (!imageSources[imageIndex]) fail('image out of range');
    const sampler = tex.sampler === undefined ? {} : at(samplers, tex.sampler);
    absent(sampler, ['extensions']);
    const mag = integer(sampler.magFilter ?? 9729),
      min = integer(sampler.minFilter ?? 9987);
    let filter: TextureFilter;
    if (mag === 9728 && min === 9728) filter = 'nearest';
    else if (mag === 9729 && min === 9729) filter = 'linear';
    else if (mag === 9729 && min === 9987) filter = 'trilinear';
    else fail('unsupported sampler filter combination');
    const wrap = (value: unknown): TextureWrap => {
      const code = integer(value ?? 10497);
      if (code === 10497) return 'repeat';
      if (code === 33071) return 'clamp';
      if (code === 33648) return 'mirror';
      return fail('unsupported sampler wrap');
    };
    const image = options.resolveImage(imageIndex, colorSpace);
    if (!(image instanceof TextureImage) || image.colorSpace !== colorSpace)
      fail('decoded image transfer function mismatch');
    return {
      image,
      filter,
      wrapS: wrap(sampler.wrapS),
      wrapT: wrap(sampler.wrapT),
    };
  }
  const materials = (
    doc.materials === undefined ? [] : list(doc.materials)
  ).map((value, i): Material3D => {
    const m = object(value);
    absent(m, [
      'extensions',
      ...(options.resolveImage ? [] : ['normalTexture', 'occlusionTexture']),
      'emissiveTexture',
    ]);
    const alphaMode = m.alphaMode ?? 'OPAQUE';
    if (alphaMode !== 'OPAQUE' && alphaMode !== 'BLEND')
      fail('only OPAQUE and uniform BLEND materials supported');
    if (m.doubleSided !== undefined && typeof m.doubleSided !== 'boolean')
      fail('doubleSided must be boolean');
    const p = object(m.pbrMetallicRoughness ?? {});
    absent(p, ['extensions']);
    if (!options.resolveImage)
      absent(p, ['baseColorTexture', 'metallicRoughnessTexture']);
    // The GPU's current transparency contract is per-primitive coverage.
    // Texture alpha and MASK require a different shader/depth contract.
    if (alphaMode === 'BLEND' && p.baseColorTexture !== undefined)
      fail('BLEND base-color texture alpha is not supported');
    const base = vector(p.baseColorFactor ?? [1, 1, 1, 1], 4).map(unit);
    const emissive = vector(m.emissiveFactor ?? [0, 0, 0], 3).map(unit);
    const srgb = (n: number) =>
      Math.round(
        255 * (n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055),
      )
        .toString(16)
        .padStart(2, '0');
    return {
      name: name(m.name, `material-${i}`),
      color: `#${base.slice(0, 3).map(srgb).join('')}`,
      baseColorFactor: [base[0]!, base[1]!, base[2]!, 1],
      ...(alphaMode === 'BLEND' ? { opacity: base[3]! } : {}),
      metallicFactor: unit(p.metallicFactor ?? 1),
      roughnessFactor: unit(p.roughnessFactor ?? 1),
      emissiveFactor: emissive,
      ...(p.baseColorTexture !== undefined
        ? { baseColorTexture: binding(p.baseColorTexture, 'srgb') }
        : {}),
      ...(p.metallicRoughnessTexture !== undefined
        ? {
            metallicRoughnessTexture: binding(
              p.metallicRoughnessTexture,
              'linear',
            ),
          }
        : {}),
      ...(m.occlusionTexture !== undefined
        ? {
            occlusionTexture: binding(m.occlusionTexture, 'linear'),
            occlusionStrength: unit(object(m.occlusionTexture).strength ?? 1),
          }
        : {}),
      ...(m.normalTexture !== undefined
        ? {
            normalTexture: binding(m.normalTexture, 'linear'),
            normalScale: finite(object(m.normalTexture).scale ?? 1),
          }
        : {}),
    };
  });
  const defaultMaterial: Material3D = { color: '#ffffff' };
  let triangles = 0,
    vertices = 0;
  const meshes = list(doc.meshes).map((value) => {
    const m = object(value);
    absent(m, ['weights', 'extensions']);
    const primitives = list(m.primitives);
    if (!primitives.length) fail('empty mesh');
    return primitives.map((value) => {
      const p = object(value);
      absent(p, ['targets', 'extensions']);
      if (p.mode !== undefined && p.mode !== 4)
        fail('only triangle primitives supported');
      const a = object(p.attributes);
      if (
        Object.keys(a).some(
          (k) => !['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT'].includes(k),
        )
      )
        fail('unsupported vertex attribute');
      const positions = accessor(a.POSITION, 'VEC3');
      const points = (rows: number[][]) =>
        rows.map((v) => ({ x: v[0]!, y: v[1]!, z: v[2]! }));
      const ids =
        p.indices === undefined
          ? positions.map((_, i) => i)
          : accessor(p.indices, 'SCALAR', true).map((v) => v[0]!);
      if (ids.length % 3)
        fail('triangle index count must be divisible by three');
      const faces = Array.from({ length: ids.length / 3 }, (_, i) => ({
        id: String(i),
        indices: ids.slice(i * 3, i * 3 + 3),
        material: 0,
      }));
      const normals =
        a.NORMAL === undefined ? [] : points(accessor(a.NORMAL, 'VEC3'));
      const texCoords =
        a.TEXCOORD_0 === undefined
          ? []
          : accessor(a.TEXCOORD_0, 'VEC2').map((v) => [v[0]!, v[1]!] as const);
      const tangents =
        a.TANGENT === undefined
          ? []
          : accessor(a.TANGENT, 'VEC4').map(
              (t) => [t[0]!, t[1]!, t[2]!, t[3]!] as const,
            );
      const geometry = new MeshGeometry(points(positions), faces, [], {
        normals,
        texCoords,
        tangents,
      });
      const material =
        p.material === undefined
          ? defaultMaterial
          : (materials[integer(p.material)] ?? fail('material out of range'));
      if (
        material.normalTexture &&
        (!normals.length || !tangents.length || !texCoords.length)
      )
        fail('normal texture requires normals, tangents and UV0');
      if (
        (material.baseColorTexture ||
          material.metallicRoughnessTexture ||
          material.occlusionTexture) &&
        !texCoords.length
      )
        fail('textures require UV0');
      triangles += faces.length;
      vertices += positions.length;
      return new Mesh3D(geometry, [material]);
    });
  });
  const definitions = list(doc.nodes).map(object);
  const matrices = definitions.map(nodeMatrix);
  const children = definitions.map((n) =>
    n.children === undefined ? [] : list(n.children).map((v) => integer(v)),
  );
  const parents = new Set<number>();
  for (const links of children)
    for (const child of links) {
      if (!definitions[child] || parents.has(child))
        fail('invalid or multiple node parents');
      parents.add(child);
    }
  const visiting = new Set<number>(),
    visited = new Set<number>();
  function visit(i: number): void {
    if (visiting.has(i)) fail('node cycle');
    if (visited.has(i)) return;
    visiting.add(i);
    for (const child of children[i]!) visit(child);
    visiting.delete(i);
    visited.add(i);
  }
  definitions.forEach((_, i) => visit(i));
  definitions.forEach((n) => {
    absent(n, ['skin', 'weights', 'extensions']);
    if (n.mesh !== undefined && !meshes[integer(n.mesh)])
      fail('mesh out of range');
  });
  const scene = at(list(doc.scenes), doc.scene ?? 0),
    roots = list(scene.nodes ?? []).map((v) => integer(v));
  if (
    new Set(roots).size !== roots.length ||
    roots.some((i) => !definitions[i] || parents.has(i))
  )
    fail('invalid scene roots');
  const cameraDefs = (doc.cameras === undefined ? [] : list(doc.cameras)).map(
    (value) => {
      const c = object(value);
      absent(c, ['extensions']);
      if (c.type !== 'perspective')
        fail('only finite perspective cameras supported');
      const p = object(c.perspective),
        yfov = finite(p.yfov),
        near = finite(p.znear),
        far = finite(p.zfar);
      if (yfov <= 0 || yfov >= Math.PI || near <= 0 || far <= near)
        fail('invalid perspective camera');
      const aspectRatio =
        p.aspectRatio === undefined ? undefined : finite(p.aspectRatio);
      if (aspectRatio !== undefined && aspectRatio <= 0)
        fail('invalid camera aspect ratio');
      return {
        name: name(c.name, 'camera'),
        yfov,
        near,
        far,
        ...(aspectRatio === undefined ? {} : { aspectRatio }),
      };
    },
  );
  definitions.forEach((n) => {
    if (n.camera !== undefined && !cameraDefs[integer(n.camera)])
      fail('camera out of range');
  });
  const sceneName = name(scene.name, 'glTF scene');
  return Object.freeze({
    name: sceneName,
    triangles,
    vertices,
    meshCount: meshes.length,
    instantiate(): GlbInstance {
      const nodes = definitions.map((n, i) => {
        const node = new Node3D(name(n.name, `node-${i}`));
        node.matrix = matrices[i]!;
        if (n.mesh !== undefined) {
          const parts = meshes[integer(n.mesh)]!;
          if (parts.length === 1) node.mesh = parts[0]!;
          else
            parts.forEach((mesh, j) => {
              const primitive = new Node3D(`${node.name}/primitive-${j}`);
              primitive.mesh = mesh;
              node.add(primitive);
            });
        }
        return node;
      });
      children.forEach((links, i) =>
        links.forEach((child) => nodes[i]!.add(nodes[child]!)),
      );
      const root = new Node3D(sceneName);
      roots.forEach((i) => root.add(nodes[i]!));
      const active = new Set<Node3D>();
      root.traverse((n) => active.add(n));
      const cameras = definitions.flatMap((n, i) =>
        n.camera === undefined || !active.has(nodes[i]!)
          ? []
          : [
              Object.freeze({
                ...cameraDefs[integer(n.camera)]!,
                node: nodes[i]!,
              }),
            ],
      );
      return {
        root,
        nodes: Object.freeze(nodes),
        cameras: Object.freeze(cameras),
      };
    },
  });
}
/** Caller owns cancellation and model lifetime. No global cache, DOM or renderer dependency. */
export async function loadGlb(
  url: string | URL,
  options: { signal?: AbortSignal } = {},
): Promise<GlbModel> {
  const response = await fetch(url, options);
  if (!response.ok) fail(`HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  options.signal?.throwIfAborted();
  return parseGlb(bytes);
}

export interface EmbeddedGlbImage {
  readonly index: number;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly bytes: Uint8Array;
}
/** Embedded PNG/JPEG descriptors. No decoding, network, GPU or model-specific name mapping. */
export function embeddedGlbImages(
  buffer: ArrayBuffer,
): readonly EmbeddedGlbImage[] {
  const { document, binary } = readGlbContainer(buffer),
    doc = object(document);
  if (doc.images === undefined) return [];
  const source = at(list(doc.buffers), 0),
    limit = integer(source.byteLength, 1),
    views = list(doc.bufferViews);
  absent(source, ['uri']);
  if (!binary || binary.byteLength < limit || binary.byteLength - limit > 3)
    fail('invalid image BIN buffer');
  return list(doc.images).map((value, index) => {
    const image = object(value);
    absent(image, ['uri', 'extensions']);
    if (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg')
      fail('only embedded PNG/JPEG supported');
    const view = at(views, image.bufferView);
    absent(view, ['byteStride', 'extensions']);
    if (integer(view.buffer) !== 0) fail('external image buffer');
    const start = integer(view.byteOffset ?? 0),
      length = integer(view.byteLength, 1);
    if (start + length > limit) fail('image exceeds buffer bounds');
    return Object.freeze({
      index,
      mimeType: image.mimeType,
      bytes: new Uint8Array(buffer, binary.byteOffset + start, length),
    });
  });
}
