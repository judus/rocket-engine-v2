import { DynamicTextureImage } from '../src/3d/index.js';
import { directionalShadowMatrix } from '../src/3d/DirectionalShadow.js';
import { WebGLShadowPass } from '../src/webgl/ShadowPass.js';
import { bakeEnvironment } from '../src/3d/EnvironmentMap.js';
import { WebGLEnvironmentStore } from '../src/webgl/EnvironmentStore.js';
import { identityMatrix } from '../src/3d/Matrix4.js';
import {
  Node3D,
  MeshGeometry,
  Mesh3D,
  PerspectiveCamera,
  TextureImage,
} from '../src/3d/index.js';
import { meshColorVertices } from '../src/webgl/MeshRenderer3D.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLColorRenderer, WebGLMeshRenderer3D } from '../src/webgl/index.js';
import type { ColorVertex } from '../src/webgl/index.js';
import { Presentation } from '../src/Presentation.js';
const vertices: ColorVertex[] = [
  { position: { x: -1, y: -1, z: 0 }, color: [1, 0, 0] },
  { position: { x: 1, y: -1, z: 0 }, color: [0, 1, 0] },
  { position: { x: 0, y: 1, z: 0 }, color: [0, 0, 1] },
];
function fixture(failure = '') {
  const shaders = new Set(),
    programs = new Set(),
    buffers = new Set(),
    vaos = new Set();
  let lost = false,
    draws = 0;
  const calls: { name: string; args: unknown[] }[] = [];
  const constants = Object.fromEntries(
    [
      'VERTEX_SHADER',
      'FRAGMENT_SHADER',
      'COMPILE_STATUS',
      'LINK_STATUS',
      'ARRAY_BUFFER',
      'STATIC_DRAW',
      'FLOAT',
      'FRAMEBUFFER',
      'FRAMEBUFFER_COMPLETE',
      'DEPTH_ATTACHMENT',
      'DEPTH_COMPONENT24',
      'DEPTH_COMPONENT',
      'UNSIGNED_INT',
      'TEXTURE_COMPARE_MODE',
      'POLYGON_OFFSET_FILL',
      'SCISSOR_TEST',
      'DEPTH_TEST',
      'DEPTH_BUFFER_BIT',
      'LESS',
      'CULL_FACE',
      'BLEND',
      'RASTERIZER_DISCARD',
      'COLOR_BUFFER_BIT',
      'TRIANGLES',
      'RGBA',
      'UNSIGNED_BYTE',
      'MAX_TEXTURE_SIZE',
      'TEXTURE0',
      'TEXTURE_2D',
      'TEXTURE_CUBE_MAP',
      'TEXTURE_CUBE_MAP_POSITIVE_X',
      'MAX_CUBE_MAP_TEXTURE_SIZE',
      'TEXTURE_BASE_LEVEL',
      'TEXTURE_MAX_LEVEL',
      'TEXTURE_WRAP_R',
      'SRGB8_ALPHA8',
      'RGBA8',
      'UNPACK_ALIGNMENT',
      'UNPACK_FLIP_Y_WEBGL',
      'UNPACK_PREMULTIPLY_ALPHA_WEBGL',
      'UNPACK_COLORSPACE_CONVERSION_WEBGL',
      'NONE',
      'TEXTURE_WRAP_S',
      'TEXTURE_WRAP_T',
      'REPEAT',
      'CLAMP_TO_EDGE',
      'MIRRORED_REPEAT',
      'TEXTURE_MAG_FILTER',
      'TEXTURE_MIN_FILTER',
      'NEAREST',
      'LINEAR',
      'LINEAR_MIPMAP_LINEAR',
    ].map((v, i) => [v, i + 1]),
  );
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    getParameter: () => 4096,
    createTexture: () => ({}),
    createRenderbuffer: () => ({}),
    createFramebuffer: () => (failure === 'framebuffer' ? null : {}),
    checkFramebufferStatus: () =>
      failure === 'incomplete' ? 0 : constants.FRAMEBUFFER_COMPLETE,
    createSampler: () => ({}),
    getContextAttributes: () => ({ depth: true }),
    createShader: () => {
      const v = {};
      shaders.add(v);
      return v;
    },
    deleteShader: (v) => shaders.delete(v),
    getShaderParameter: () => failure !== 'compile',
    getShaderInfoLog: () => 'compiler diagnostic',
    createProgram: () => {
      const v = {};
      programs.add(v);
      return v;
    },
    deleteProgram: (v) => programs.delete(v),
    getProgramParameter: () => failure !== 'link',
    getProgramInfoLog: () => 'link diagnostic',
    getUniformLocation: () => ({}),
    createBuffer: () => {
      if (failure === 'buffer') return null;
      const v = {};
      buffers.add(v);
      return v;
    },
    deleteBuffer: (v) => buffers.delete(v),
    createVertexArray: () => {
      const v = {};
      vaos.add(v);
      return v;
    },
    deleteVertexArray: (v) => vaos.delete(v),
    isContextLost: () => lost,
    drawArrays: () => {
      draws++;
    },
  };
  const gl = new Proxy(
    { ...constants, drawingBufferWidth: 640, drawingBufferHeight: 360 },
    {
      get(target, key) {
        if (key in target) return Reflect.get(target, key) as unknown;
        return (...args: unknown[]) => {
          calls.push({ name: String(key), args });
          return methods[String(key)]?.(...args);
        };
      },
    },
  ) as unknown as WebGL2RenderingContext;
  return {
    gl,
    calls,
    shaders,
    programs,
    buffers,
    vaos,
    get draws() {
      return draws;
    },
    lose() {
      lost = true;
    },
  };
}
void test('GPU upload is retained across draws; individual and renderer cleanup retire every allocation exactly once', () => {
  const f = fixture(),
    renderer = new WebGLColorRenderer(f.gl),
    mesh = renderer.upload(vertices);
  assert.equal(f.shaders.size, 0);
  assert.equal(f.programs.size, 1);
  assert.equal(f.buffers.size, 1);
  assert.equal(f.vaos.size, 1);
  renderer.draw(mesh);
  renderer.draw(mesh);
  assert.equal(f.draws, 2);
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.deepEqual(f.calls.find((c) => c.name === 'drawArrays')!.args, [
    f.gl.TRIANGLES,
    0,
    3,
  ]);
  mesh.dispose();
  mesh.dispose();
  assert.equal(f.buffers.size, 0);
  assert.equal(f.vaos.size, 0);
  assert.throws(() => renderer.draw(mesh), /disposed/);
  renderer.upload(vertices);
  renderer.dispose();
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
  assert.equal(f.vaos.size, 0);
  assert.equal(f.programs.size, 0);
  assert.equal(f.calls.filter((c) => c.name === 'deleteProgram').length, 1);
  assert.throws(() => renderer.upload(vertices), /disposed/);
});
void test('compile/link failures report diagnostics and roll back partial shader/program allocations', () => {
  for (const stage of ['compile', 'link']) {
    const f = fixture(stage);
    assert.throws(() => new WebGLColorRenderer(f.gl), /diagnostic/);
    assert.equal(f.shaders.size, 0);
    assert.equal(f.programs.size, 0);
  }
  const f = fixture('buffer'),
    renderer = new WebGLColorRenderer(f.gl);
  assert.throws(() => renderer.upload(vertices), /allocation/);
  assert.equal(f.vaos.size, 0);
  renderer.dispose();
});
void test('invalid vertices, foreign meshes and lost contexts fail before GPU draws', () => {
  const f = fixture(),
    renderer = new WebGLColorRenderer(f.gl),
    other = new WebGLColorRenderer(f.gl),
    mesh = renderer.upload(vertices);
  assert.throws(() => renderer.upload([]), /multiple/);
  assert.throws(() => renderer.upload(vertices.slice(0, 2)), /multiple/);
  const bad = structuredClone(vertices);
  bad[0] = { ...bad[0]!, position: { x: Infinity, y: 0, z: 0 } };
  assert.throws(() => renderer.upload(bad), /vertex/);
  const sparse = Array<ColorVertex>(3);
  assert.throws(() => renderer.upload(sparse), /vertex/);
  assert.throws(() => other.draw(mesh), /another renderer/);
  assert.equal(f.draws, 0);
  f.lose();
  assert.throws(() => renderer.draw(mesh), /lost/);
  renderer.dispose();
  other.dispose();
});
void test('generic presentation hooks reject async callbacks and mark disposed even if cleanup fails', () => {
  assert.throws(
    () =>
      new Presentation({
        scene: {},
        render: async () => {},
      } as unknown as ConstructorParameters<typeof Presentation>[0]),
    /synchronous/,
  );
  const slot = new Presentation({
    scene: {},
    render() {},
    dispose() {
      throw new Error('cleanup');
    },
  });
  assert.throws(() => slot.dispose(), /cleanup/);
  assert.equal(slot.disposed, true);
  slot.dispose();
  slot.render({ dt: 0, time: 0 });
});

void test('GPU mesh adapter caches immutable bindings, preserves world transforms, clears once and retires unused meshes', () => {
  const f = fixture();
  const renderer = new WebGLMeshRenderer3D(f.gl);
  const root = new Node3D('root'),
    a = new Node3D('a'),
    b = new Node3D('b');
  const geometry = new MeshGeometry(
    vertices.map((v) => v.position),
    [{ id: 'face', indices: [0, 1, 2], material: 0 }],
  );
  const mesh = new Mesh3D(geometry, [{ color: '#ff0000' }]);
  a.mesh = b.mesh = mesh;
  root.transform = { ...root.transform, position: { x: 1, y: 0, z: 5 } };
  b.transform = { ...b.transform, position: { x: 2, y: 0, z: 0 } };
  root.add(a).add(b);
  const camera = new PerspectiveCamera();
  assert.deepEqual(renderer.render(root, camera, 640, 360), {
    drawCalls: 2,
    triangles: 2,
    cachedMeshes: 1,
    uploadedBytes: 72,
  });
  assert.equal(f.calls.filter((c) => c.name === 'clear').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.ok(
    f.calls.some((c) => c.name === 'enable' && c.args[0] === f.gl.DEPTH_TEST),
  );
  const transforms = f.calls
    .filter((c) => c.name === 'uniformMatrix4fv')
    .map((c) => Array.from(c.args[2] as Float32Array));
  assert.notDeepEqual(transforms[0], transforms[1]);
  renderer.render(root, camera, 640, 360, { reverseOrder: true });
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  a.visible = b.visible = false;
  assert.equal(renderer.render(root, camera, 640, 360).cachedMeshes, 0);
  assert.equal(f.buffers.size, 0);
  a.visible = true;
  renderer.render(root, camera, 640, 360, { depthTest: false });
  assert.equal(f.buffers.size, 1);
  renderer.dispose();
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
  assert.equal(f.vaos.size, 0);
  assert.equal(f.programs.size, 0);
  assert.throws(() => renderer.render(root, camera, 640, 360), /disposed/);
});

void test('mesh triangulation expands convex faces once and preserves authored sRGB color', () => {
  const geometry = new MeshGeometry(
    [
      { x: -1, y: -1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: -1, y: 1, z: 0 },
    ],
    [{ id: 'quad', indices: [0, 1, 2, 3], material: 0 }],
  );
  const expanded = meshColorVertices(
    new Mesh3D(geometry, [{ color: '#808080' }]),
  );
  assert.equal(expanded.length, 6);
  assert.deepEqual(
    expanded.map((v) => v.position),
    [0, 1, 2, 0, 2, 3].map((i) => geometry.vertices[i]),
  );
  assert.ok(Math.abs(expanded[0]!.color[0] - 0.2158605) < 1e-6);
  assert.throws(
    () => meshColorVertices(new Mesh3D(geometry, [{ color: 'red' }])),
    /opaque/,
  );
});

void test('lit GPU meshes retain uploads when lights change and submit separate normal/world/light uniforms', () => {
  const f = fixture(),
    renderer = new WebGLMeshRenderer3D(f.gl, { lighting: true });
  const root = new Node3D();
  root.mesh = new Mesh3D(
    new MeshGeometry(
      vertices.map((v) => v.position),
      [{ id: 'face', indices: [0, 1, 2], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  root.transform = {
    ...root.transform,
    position: { x: 0, y: 0, z: 4 },
    scale: { x: 2, y: 1, z: 0.5 },
  };
  const camera = new PerspectiveCamera();
  assert.equal(
    renderer.render(root, camera, 640, 360, { lights: [] }).uploadedBytes,
    144,
  );
  renderer.render(root, camera, 640, 360, {
    lights: [
      {
        kind: 'point',
        position: { x: 1, y: 2, z: 0 },
        color: [1, 1, 1],
        intensity: 4,
      },
    ],
  });
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'uniformMatrix3fv').length, 2);
  assert.deepEqual(
    Array.from(
      f.calls.find((c) => c.name === 'uniformMatrix3fv')!
        .args[2] as Float32Array,
    ),
    [0.5, 0, 0, 0, 1, 0, 0, 0, 2],
  );
  const before = f.draws;
  assert.throws(
    () =>
      renderer.render(root, camera, 640, 360, {
        lights: [{ kind: 'ambient', color: [1, 1, 1], intensity: -1 }],
      }),
    /intensity/,
  );
  assert.equal(f.draws, before);
  root.transform = { ...root.transform, scale: { x: 0, y: 1, z: 1 } };
  assert.throws(() => renderer.render(root, camera, 640, 360), /invertible/);
  assert.equal(f.draws, before);
  renderer.dispose();
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
  assert.equal(f.vaos.size, 0);
  assert.equal(f.programs.size, 0);
});

void test('textured mesh adapter validates UV/binding boundaries and reuses image uploads across material changes', () => {
  const f = fixture(),
    renderer = new WebGLMeshRenderer3D(f.gl, {
      lighting: true,
      textures: true,
    });
  const image = new TextureImage(1, 1, new Uint8Array([128, 128, 128, 255]));
  const points = [
    { x: -1, y: -1, z: 3 },
    { x: 1, y: -1, z: 3 },
    { x: 0, y: 1, z: 3 },
  ];
  const faces = [{ id: 'a', indices: [0, 1, 2], material: 0 }];
  const geometry = new MeshGeometry(points, faces, [], {
    texCoords: [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ],
  });
  const root = new Node3D('textured'),
    camera = new PerspectiveCamera();
  root.mesh = new Mesh3D(geometry, [
    { color: '#ffffff', baseColorTexture: { image } },
  ]);
  renderer.render(root, camera, 640, 360);
  renderer.render(root, camera, 640, 360);
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.equal(renderer.textureStats!.textures, 1);
  root.mesh = new Mesh3D(geometry, [
    { color: '#ffffff', baseColorTexture: { image, filter: 'nearest' } },
  ]);
  renderer.render(root, camera, 640, 360);
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(renderer.textureStats!.samplers, 1);
  root.mesh = new Mesh3D(new MeshGeometry(points, faces), [
    { color: '#ffffff', baseColorTexture: { image } },
  ]);
  assert.throws(() => renderer.render(root, camera, 640, 360), /UV/);
  const mixed = new MeshGeometry(
    points,
    [...faces, { id: 'b', indices: [0, 2, 1], material: 1 }],
    [],
    {
      texCoords: [
        [0, 0],
        [1, 0],
        [0.5, 1],
      ],
    },
  );
  root.mesh = new Mesh3D(mixed, [
    { color: '#ffffff', baseColorTexture: { image } },
    { color: '#ffffff' },
  ]);
  assert.throws(
    () => renderer.render(root, camera, 640, 360),
    /separate primitives/,
  );
  renderer.dispose();
  const untextured = new WebGLMeshRenderer3D(f.gl, { lighting: true });
  root.mesh = new Mesh3D(geometry, [
    { color: '#ffffff', baseColorTexture: { image } },
  ]);
  assert.throws(
    () => untextured.render(root, camera, 640, 360),
    /texture pipeline/,
  );
  untextured.dispose();
});

void test('material response is opt-in, validates scalar data, and retains independent per-face factors', () => {
  const geometry = new MeshGeometry(
    [
      { x: -1, y: -1, z: 3 },
      { x: 1, y: -1, z: 3 },
      { x: 0, y: 1, z: 3 },
    ],
    [
      { id: 'a', indices: [0, 1, 2], material: 0 },
      { id: 'b', indices: [0, 2, 1], material: 1 },
    ],
  );
  const mesh = new Mesh3D(geometry, [
    { color: '#ffffff', metallicFactor: 0, roughnessFactor: 0.25 },
    { color: '#ffffff', metallicFactor: 1, roughnessFactor: 1 },
  ]);
  assert.deepEqual(
    meshColorVertices(mesh, true, true).map((v) => v.materialFactors),
    [
      [0, 0.25],
      [0, 0.25],
      [0, 0.25],
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  );
  assert.equal(meshColorVertices(mesh, true)[0]!.materialFactors, undefined);
  for (const bad of [NaN, Infinity, -0.01, 1.01]) {
    assert.throws(
      () =>
        meshColorVertices(
          new Mesh3D(geometry, [
            { color: '#ffffff', metallicFactor: bad },
            { color: '#ffffff' },
          ]),
          true,
          true,
        ),
      /factors/,
    );
    assert.throws(
      () =>
        meshColorVertices(
          new Mesh3D(geometry, [
            { color: '#ffffff', roughnessFactor: bad },
            { color: '#ffffff' },
          ]),
          true,
          true,
        ),
      /factors/,
    );
  }
  assert.deepEqual(
    meshColorVertices(
      new Mesh3D(geometry, [{ color: '#ffffff' }, { color: '#ffffff' }]),
      true,
      true,
    )[0]!.materialFactors,
    [1, 1],
  );
  assert.throws(
    () => new WebGLColorRenderer(fixture().gl, { materialResponse: true }),
    /lighting/,
  );
});
void test('material pipeline uploads once, passes view position each frame and uses the correct attribute stride', () => {
  for (const textures of [false, true]) {
    const f = fixture(),
      renderer = new WebGLColorRenderer(f.gl, {
        lighting: true,
        textures,
        materialResponse: true,
      });
    const data = vertices.map((v) => ({
      ...v,
      normal: { x: 0, y: 0, z: -1 },
      materialFactors: [0.5, 0.75] as const,
      texCoord: [0, 0] as const,
    }));
    const mesh = renderer.upload(data);
    const pointer = f.calls.find(
      (c) => c.name === 'vertexAttribPointer' && c.args[0] === 5,
    )!;
    assert.equal(pointer.args[4], textures ? 64 : 56);
    assert.equal(pointer.args[5], textures ? 56 : 48);
    const world = identityMatrix;
    assert.throws(
      () =>
        renderer.drawFrame([{ mesh, transform: world }], true, { lights: [] }),
      /camera position/,
    );
    assert.equal(f.draws, 0);
    for (const x of [0, 3])
      renderer.drawFrame([{ mesh, transform: world }], true, {
        lights: [],
        cameraPosition: { x, y: 0, z: 0 },
      });
    assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
    assert.deepEqual(
      f.calls.filter((c) => c.name === 'uniform3f').map((c) => c.args.slice(1)),
      [
        [0, 0, 0],
        [3, 0, 0],
      ],
    );
    assert.throws(
      () =>
        renderer.drawFrame([{ mesh, transform: world }], true, {
          lights: [],
          cameraPosition: { x: Infinity, y: 0, z: 0 },
        }),
      /camera position/,
    );
    renderer.dispose();
    renderer.dispose();
    assert.equal(f.buffers.size, 0);
    assert.equal(f.programs.size, 0);
  }
});

void test('packed maps require the opted-in pipeline and UVs; shared ORM binds once without repeat uploads', () => {
  const f = fixture(),
    asset = new TextureImage(1, 1, new Uint8Array([64, 128, 192, 255]), {
      colorSpace: 'linear',
    });
  assert.throws(
    () => new WebGLColorRenderer(f.gl, { materialMaps: true }),
    /require/,
  );
  const renderer = new WebGLMeshRenderer3D(f.gl, {
    lighting: true,
    textures: true,
    materialResponse: true,
    materialMaps: true,
  });
  const points = [
      { x: -1, y: -1, z: 3 },
      { x: 1, y: -1, z: 3 },
      { x: 0, y: 1, z: 3 },
    ],
    faces = [{ id: 'a', indices: [0, 1, 2], material: 0 }];
  const geometry = new MeshGeometry(points, faces, [], {
    texCoords: [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ],
  });
  const material = {
    color: '#ffffff',
    metallicRoughnessTexture: { image: asset },
    occlusionTexture: { image: asset },
    occlusionStrength: 0.5,
  };
  const root = new Node3D('packed'),
    camera = new PerspectiveCamera();
  root.mesh = new Mesh3D(geometry, [material]);
  renderer.render(root, camera, 640, 360, { materialDebug: 'roughness' });
  renderer.render(root, camera, 640, 360, { materialDebug: 'metallic' });
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 2); // one neutral base + one shared ORM
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.equal(renderer.textureStats!.textures, 2);
  assert.throws(
    () =>
      renderer.render(root, camera, 640, 360, {
        materialDebug: 'toString' as 'none',
      }),
    /channel view/,
  );
  assert.ok(f.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.5));
  root.mesh = new Mesh3D(new MeshGeometry(points, faces), [material]);
  assert.throws(() => renderer.render(root, camera, 640, 360), /UV/);
  root.mesh = new Mesh3D(
    new MeshGeometry(
      points,
      [...faces, { id: 'b', indices: [0, 2, 1], material: 1 }],
      [],
      {
        texCoords: [
          [0, 0],
          [1, 0],
          [0.5, 1],
        ],
      },
    ),
    [material, { ...material, occlusionStrength: 0 }],
  );
  assert.throws(
    () => renderer.render(root, camera, 640, 360),
    /occlusion strengths/,
  );
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
  const previous = new WebGLMeshRenderer3D(f.gl, {
    lighting: true,
    textures: true,
    materialResponse: true,
  });
  root.mesh = new Mesh3D(geometry, [material]);
  assert.throws(
    () => previous.render(root, camera, 640, 360),
    /Material-map pipeline/,
  );
  previous.dispose();
});

void test('normal pipeline validates tangent bases, requires tangents when bound and retains the 80-byte layout', () => {
  const f = fixture();
  assert.throws(
    () => new WebGLColorRenderer(f.gl, { normalMapping: true }),
    /require/,
  );
  const renderer = new WebGLColorRenderer(f.gl, {
    lighting: true,
    textures: true,
    materialResponse: true,
    normalMapping: true,
  });
  const data = vertices.map((v) => ({
    ...v,
    normal: { x: 0, y: 0, z: -1 },
    tangent: [2, 0, 0, 1] as const,
  }));
  const mesh = renderer.upload(data),
    pointer = f.calls.find(
      (c) => c.name === 'vertexAttribPointer' && c.args[0] === 6,
    )!;
  assert.equal(pointer.args[4], 80);
  assert.equal(pointer.args[5], 64);
  const normalTexture = {
    image: new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255]), {
      colorSpace: 'linear',
    }),
  };
  renderer.drawFrame(
    [
      {
        mesh,
        transform: identityMatrix,
        world: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        normalTexture,
      },
    ],
    true,
    { lights: [], cameraPosition: { x: 0, y: 0, z: 0 } },
  );
  assert.ok(f.calls.some((c) => c.name === 'uniform1f' && c.args[1] === -1));
  assert.throws(
    () =>
      renderer.upload(
        data.map((v) => ({ ...v, tangent: [0, 0, 1, 1] as const })),
      ),
    /basis/,
  );
  const unbound = renderer.upload(
    vertices.map((v) => ({ ...v, normal: { x: 0, y: 0, z: -1 } })),
  );
  assert.throws(
    () =>
      renderer.drawFrame(
        [{ mesh: unbound, transform: identityMatrix, normalTexture }],
        true,
        { lights: [], cameraPosition: { x: 0, y: 0, z: 0 } },
      ),
    /tangent basis/,
  );
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
  assert.equal(f.programs.size, 0);
});
void test('normal-map mesh adapter requires normals, tangents and UV0 without inventing a basis', () => {
  const f = fixture(),
    renderer = new WebGLMeshRenderer3D(f.gl, {
      lighting: true,
      textures: true,
      materialResponse: true,
      normalMapping: true,
    });
  const points = [
      { x: 0, y: 0, z: 3 },
      { x: 1, y: 0, z: 3 },
      { x: 0, y: 1, z: 3 },
    ],
    faces = [{ id: 'a', indices: [0, 1, 2], material: 0 }];
  const material = {
    color: '#ffffff',
    normalTexture: {
      image: new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255]), {
        colorSpace: 'linear',
      }),
    },
  };
  const root = new Node3D('normal'),
    camera = new PerspectiveCamera();
  root.mesh = new Mesh3D(new MeshGeometry(points, faces), [material]);
  assert.throws(
    () => renderer.render(root, camera, 640, 360),
    /normals and tangents/,
  );
  const geometry = new MeshGeometry(points, faces, [], {
    normals: points.map(() => ({ x: 0, y: 0, z: 1 })),
    tangents: points.map(() => [1, 0, 0, 1] as const),
    texCoords: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  });
  root.mesh = new Mesh3D(geometry, [material]);
  renderer.render(root, camera, 640, 360);
  renderer.render(root, camera, 640, 360, {
    normalMappingEnabled: false,
    normalDebug: true,
  });
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.equal(renderer.textureStats!.textures, 2);
  renderer.dispose();
});

void test('environment uploads retained prefiltered levels, replaces and disposes textures without regenerating ordinary mipmaps', () => {
  const f = fixture(),
    store = new WebGLEnvironmentStore(f.gl);
  const env = bakeEnvironment(() => [0.5, 0.25, 0.1], {
    size: 4,
    samples: 16,
    diffuseSize: 2,
    lutSize: 4,
  });
  store.bind(env);
  store.end();
  store.bind(env);
  store.end();
  assert.equal(f.calls.filter((c) => c.name === 'createTexture').length, 3);
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 25); // 3*6 specular + 6 diffuse + LUT
  assert.equal(f.calls.filter((c) => c.name === 'generateMipmap').length, 0);
  assert.equal(
    store.stats.textureBytes,
    (16 + 4 + 1) * 6 * 4 + 4 * 6 * 4 + 16 * 4,
  );
  store.bind(
    bakeEnvironment(() => [0, 0, 0], {
      size: 2,
      samples: 16,
      diffuseSize: 1,
      lutSize: 2,
    }),
  );
  store.end();
  assert.equal(f.calls.filter((c) => c.name === 'deleteTexture').length, 3);
  store.dispose();
  store.dispose();
  assert.equal(f.calls.filter((c) => c.name === 'deleteTexture').length, 6);
  assert.throws(() => store.bind(env), /unavailable/);
});
void test('environment pipeline is opt-in, validates before drawing, and retains mesh uploads across rotation/intensity changes', () => {
  const f = fixture(),
    map = bakeEnvironment(() => [0.2, 0.3, 0.4], {
      size: 2,
      samples: 16,
      diffuseSize: 1,
      lutSize: 2,
    });
  assert.throws(
    () => new WebGLColorRenderer(f.gl, { environment: true }),
    /material response/,
  );
  const root = new Node3D(),
    camera = new PerspectiveCamera();
  root.mesh = new Mesh3D(
    new MeshGeometry(
      vertices.map((v) => v.position),
      [{ id: 'a', indices: [0, 1, 2], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  const disabled = new WebGLMeshRenderer3D(f.gl, {
    lighting: true,
    materialResponse: true,
  });
  assert.throws(
    () => disabled.render(root, camera, 640, 360, { environment: { map } }),
    /disabled pipeline/,
  );
  disabled.dispose();
  const renderer = new WebGLMeshRenderer3D(f.gl, {
    lighting: true,
    materialResponse: true,
    environment: true,
  });
  const before = f.calls.filter((c) => c.name === 'bufferData').length;
  renderer.render(root, camera, 640, 360, { environment: { map } });
  renderer.render(root, camera, 640, 360, {
    environment: { map, intensity: 0, rotation: Math.PI },
  });
  assert.equal(
    f.calls.filter((c) => c.name === 'bufferData').length - before,
    1,
  );
  assert.equal(renderer.environmentStats!.textures, 3);
  const draws = f.draws;
  assert.throws(
    () =>
      renderer.render(root, camera, 640, 360, {
        environment: { map, intensity: -1 },
      }),
    /Invalid environment/,
  );
  assert.throws(
    () =>
      renderer.render(root, camera, 640, 360, {
        environment: { map, rotation: NaN },
      }),
    /Invalid environment/,
  );
  assert.equal(f.draws, draws);
  renderer.dispose();
});

void test('directional shadow pass reuses VAOs and depth target, independently filters casters/receivers and skips disabled depth draws', () => {
  const f = fixture(),
    renderer = new WebGLMeshRenderer3D(f.gl, {
      lighting: true,
      materialResponse: true,
      shadows: true,
    }),
    root = new Node3D(),
    camera = new PerspectiveCamera();
  const geometry = new MeshGeometry(
    vertices.map((v) => v.position),
    [{ id: 'face', indices: [0, 1, 2], material: 0 }],
  );
  root.mesh = new Mesh3D(geometry, [{ color: '#ffffff' }]);
  const caster = new Node3D();
  caster.mesh = root.mesh;
  root.add(caster);
  root.castsShadow = false;
  const lights = [
    {
      kind: 'directional',
      direction: { x: 1, y: 2, z: 3 },
      color: [1, 1, 1],
      intensity: 1,
    },
  ] as const;
  const shadow = {
    lightIndex: 0,
    matrix: directionalShadowMatrix(
      lights[0].direction,
      { x: 0, y: 0, z: 0 },
      5,
      20,
    ),
    resolution: 128,
  };
  renderer.render(root, camera, 640, 360, { lights, shadow });
  assert.deepEqual(renderer.shadowStats, {
    resolution: 128,
    depthBytes: 65536,
    drawCalls: 1,
    triangles: 1,
  });
  assert.equal(f.draws, 3);
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  caster.castsShadow = false;
  root.receivesShadow = false;
  renderer.render(root, camera, 640, 360, {
    lights,
    shadow,
    shadowDebug: true,
  });
  assert.equal(renderer.shadowStats!.drawCalls, 0);
  assert.equal(f.draws, 5);
  renderer.render(root, camera, 640, 360, {
    lights,
    shadow: { ...shadow, enabled: false },
  });
  assert.equal(f.draws, 7);
  assert.equal(f.calls.filter((c) => c.name === 'createFramebuffer').length, 1);
  renderer.render(root, camera, 640, 360, {
    lights,
    shadow: { ...shadow, resolution: 256 },
  });
  assert.equal(f.calls.filter((c) => c.name === 'createFramebuffer').length, 2);
  assert.equal(f.calls.filter((c) => c.name === 'deleteFramebuffer').length, 1);
  const before = f.calls.length;
  assert.throws(
    () =>
      renderer.render(root, camera, 640, 360, {
        lights,
        shadow: { ...shadow, lightIndex: 3 },
      }),
    /directional/,
  );
  assert.deepEqual(
    f.calls.slice(before).filter((c) => c.name !== 'isContextLost'),
    [],
  );
  renderer.dispose();
  renderer.dispose();
  assert.equal(f.calls.filter((c) => c.name === 'deleteFramebuffer').length, 2);
  assert.equal(f.calls.filter((c) => c.name === 'deleteTexture').length, 2);
  assert.equal(f.programs.size, 0);
  assert.equal(f.buffers.size, 0);
});
void test('shadow framebuffer failure rolls back target allocations, and shadow shaders/programs retire on compile/link failure', () => {
  for (const failure of ['framebuffer', 'incomplete']) {
    const f = fixture(failure),
      pass = new WebGLShadowPass(f.gl);
    assert.throws(
      () =>
        pass.render([], {
          lightIndex: 0,
          matrix: identityMatrix,
          resolution: 64,
        }),
      /allocation|Incomplete/,
    );
    assert.equal(f.calls.filter((c) => c.name === 'deleteTexture').length, 1);
    assert.equal(
      f.calls.filter((c) => c.name === 'deleteFramebuffer').length,
      failure === 'incomplete' ? 1 : 0,
    );
    pass.dispose();
    assert.equal(f.programs.size, 0);
  }
  for (const failure of ['compile', 'link']) {
    const f = fixture(failure);
    assert.throws(() => new WebGLShadowPass(f.gl), /compile|link/);
    assert.equal(f.shaders.size, 0);
    assert.equal(f.programs.size, 0);
  }
  assert.throws(
    () => new WebGLColorRenderer(fixture().gl, { shadows: true }),
    /lighting/,
  );
});

void test('dynamic source revisions update shared surfaces without replacing mesh or GPU geometry', () => {
  const f = fixture(),
    renderer = new WebGLMeshRenderer3D(f.gl, {
      lighting: true,
      textures: true,
    }),
    root = new Node3D(),
    other = new Node3D();
  const source = new DynamicTextureImage(
    1,
    1,
    new Uint8Array([255, 0, 0, 255]),
  );
  root.mesh = new Mesh3D(
    new MeshGeometry(
      vertices.map((v) => v.position),
      [{ id: 'a', indices: [0, 1, 2], material: 0 }],
      [],
      {
        texCoords: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      },
    ),
    [{ color: '#ffffff', baseColorTexture: { image: source } }],
  );
  other.mesh = root.mesh;
  root.add(other);
  const camera = new PerspectiveCamera();
  renderer.render(root, camera, 640, 360);
  source.update(new Uint8Array([0, 255, 0, 255]));
  renderer.render(root, camera, 640, 360);
  renderer.render(root, camera, 640, 360);
  assert.equal(f.calls.filter((c) => c.name === 'bufferData').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'createTexture').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'texSubImage2D').length, 1);
  assert.equal(renderer.textureUploadStats!.updates, 1);
  assert.equal(f.draws, 6);
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
});

void test('per-draw unlit surfaces bypass lighting without leaking into the next draw', () => {
  const f = fixture();
  const renderer = new WebGLColorRenderer(f.gl, { lighting: true });
  const mesh = renderer.upload(
    vertices.map((v) => ({ ...v, normal: { x: 0, y: 0, z: 1 } })),
  );
  renderer.drawFrame(
    [
      { mesh, transform: identityMatrix, unlit: true },
      { mesh, transform: identityMatrix },
    ],
    true,
    { lights: [], enabled: true },
  );
  const uniforms = f.calls.filter((c) => c.name === 'uniform1i');
  const location = uniforms[0]!.args[0];
  assert.deepEqual(
    uniforms.filter((c) => c.args[0] === location).map((c) => c.args[1]),
    [1, 0, 1],
  );
  renderer.dispose();
  assert.equal(f.buffers.size, 0);
});

void test('render targets retain storage, resize atomically, reject foreign contexts and release all allocations', async () => {
  const { WebGLRenderTarget } = await import('../src/webgl/RenderTarget.js');
  const f = fixture();
  let incomplete = false;
  const gl = new Proxy(f.gl, {
    get(target, key) {
      if (key === 'checkFramebufferStatus')
        return () => (incomplete ? 0 : target.FRAMEBUFFER_COMPLETE);
      return Reflect.get(target, key) as unknown;
    },
  });
  const target = new WebGLRenderTarget(gl, 64, 32);
  const texture = target.texture;
  target.resize(64, 32);
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(target.estimatedBytes, 64 * 32 * 8);
  assert.equal(
    f.calls.find((c) => c.name === 'renderbufferStorage')!.args[1],
    gl.DEPTH_COMPONENT24,
  );
  assert.throws(() => target.assertContext(fixture().gl), /another context/);
  incomplete = true;
  assert.throws(() => target.resize(128, 64), /incomplete/);
  assert.equal(target.texture, texture);
  assert.equal(target.width, 64);
  incomplete = false;
  target.resize(128, 64);
  assert.notEqual(target.texture, texture);
  assert.throws(() => target.resize(0, 1), /dimensions/);
  target.dispose();
  target.dispose();
  for (const [create, remove] of [
    ['createTexture', 'deleteTexture'],
    ['createFramebuffer', 'deleteFramebuffer'],
    ['createRenderbuffer', 'deleteRenderbuffer'],
  ])
    assert.equal(
      f.calls.filter((c) => c.name === create).length,
      f.calls.filter((c) => c.name === remove).length,
    );
  assert.throws(() => target.bind(gl), /disposed/);
});

void test('mesh rendering explicitly targets offscreen dimensions and validates depth before GL work', async () => {
  const { WebGLRenderTarget } = await import('../src/webgl/RenderTarget.js');
  const f = fixture(),
    target = new WebGLRenderTarget(f.gl, 128, 64, false);
  const renderer = new WebGLMeshRenderer3D(f.gl);
  const root = new Node3D();
  root.mesh = new Mesh3D(
    new MeshGeometry(
      vertices.map((v) => v.position),
      [{ id: 'face', indices: [0, 1, 2], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  assert.throws(
    () => renderer.render(root, new PerspectiveCamera(), 64, 64, { target }),
    /viewport/,
  );
  assert.throws(
    () => renderer.render(root, new PerspectiveCamera(), 128, 64, { target }),
    /depth render target/,
  );
  renderer.render(root, new PerspectiveCamera(), 128, 64, {
    target,
    depthTest: false,
  });
  assert.deepEqual(
    f.calls.filter((c) => c.name === 'viewport').at(-1)!.args,
    [0, 0, 128, 64],
  );
  assert.deepEqual(
    f.calls.filter((c) => c.name === 'bindFramebuffer').at(-1)!.args,
    [f.gl.FRAMEBUFFER, null],
  );
  renderer.dispose();
  target.dispose();
});

void test('bloom retains scratch targets, skips work at zero strength, validates inputs and retires resized storage', async () => {
  const { WebGLRenderTarget, WebGLBloomPass } =
    await import('../src/webgl/index.js');
  const f = fixture(),
    scene = new WebGLRenderTarget(f.gl, 128, 64),
    bloom = new WebGLBloomPass(f.gl);
  bloom.render(scene);
  assert.deepEqual(bloom.stats, {
    drawCalls: 6,
    width: 64,
    height: 32,
    estimatedBytes: 64 * 32 * 8,
  });
  const allocations = f.calls.filter((c) => c.name === 'createTexture').length;
  bloom.render(scene, { threshold: 0.2, radius: 3, strength: 1 });
  assert.equal(
    f.calls.filter((c) => c.name === 'createTexture').length,
    allocations,
  );
  bloom.render(scene, { strength: 0 });
  assert.equal(bloom.stats.drawCalls, 1);
  bloom.render(scene, { view: 'bright' });
  assert.equal(bloom.stats.drawCalls, 2);
  bloom.render(scene, { view: 'scene' });
  assert.equal(bloom.stats.drawCalls, 1);
  const before = f.calls.filter((c) => c.name === 'drawArrays').length;
  for (const options of [{ radius: NaN }, { threshold: 2 }, { strength: -1 }])
    assert.throws(() => bloom.render(scene, options), /parameter/);
  assert.equal(f.calls.filter((c) => c.name === 'drawArrays').length, before);
  const foreign = new WebGLRenderTarget(fixture().gl, 32, 32);
  assert.throws(() => bloom.render(foreign), /another context/);
  foreign.dispose();
  scene.resize(256, 128);
  bloom.render(scene);
  assert.equal(bloom.stats.width, 128);
  bloom.dispose();
  bloom.dispose();
  scene.dispose();
  for (const [create, remove] of [
    ['createTexture', 'deleteTexture'],
    ['createFramebuffer', 'deleteFramebuffer'],
    ['createRenderbuffer', 'deleteRenderbuffer'],
  ])
    assert.equal(
      f.calls.filter((c) => c.name === create).length,
      f.calls.filter((c) => c.name === remove).length,
    );
  assert.equal(f.programs.size, 0);
  assert.equal(f.shaders.size, 0);
  assert.equal(f.vaos.size, 0);
  assert.throws(() => bloom.render(scene), /disposed/);
});

void test('bloom compile and framebuffer allocation failures clean up without accepting partial targets', async () => {
  const { WebGLRenderTarget, WebGLBloomPass } =
    await import('../src/webgl/index.js');
  const failed = fixture('compile');
  assert.throws(() => new WebGLBloomPass(failed.gl), /compile/);
  assert.equal(failed.shaders.size, 0);
  assert.equal(failed.programs.size, 0);
  const f = fixture();
  let allocations = 0;
  const gl = new Proxy(f.gl, {
    get(target, key) {
      if (key === 'checkFramebufferStatus')
        return () => (++allocations === 3 ? 0 : target.FRAMEBUFFER_COMPLETE);
      return Reflect.get(target, key) as unknown;
    },
  });
  const scene = new WebGLRenderTarget(gl, 64, 64),
    bloom = new WebGLBloomPass(gl);
  assert.throws(() => bloom.render(scene), /incomplete/);
  assert.equal(bloom.stats.estimatedBytes, 0);
  bloom.render(scene);
  assert.equal(bloom.stats.drawCalls, 6);
  bloom.dispose();
  scene.dispose();
  assert.equal(
    f.calls.filter((c) => c.name === 'createTexture').length,
    f.calls.filter((c) => c.name === 'deleteTexture').length,
  );
});
