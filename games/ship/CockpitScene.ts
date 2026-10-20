import {
  Node3D,
  PerspectiveCamera,
  matrixPoint,
  pickMesh3D,
} from '../../src/3d/index.js';
import type { Matrix4, Mesh3D, TextureImage } from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';
import { hi3dCockpitDisplays } from '../../examples/webgl/Hi3dCockpitDisplays.js';
import { hi3dCockpitLamps } from '../../examples/webgl/Hi3dCockpitLamps.js';
import { mountCockpitModel } from './CockpitModel.js';
import { CockpitResponse } from './CockpitResponse.js';
import { WindshieldSurface } from './WindshieldSurface.js';
import { WindshieldHud } from './WindshieldHud.js';
import { originalAsteroidField } from '../../examples/space/OriginalAsteroidField.js';
import { distantSun } from '../../examples/space/DistantSun.js';
import { CockpitInstruments } from './CockpitInstruments.js';
import type { Ship } from './Ship.js';
import type { NavigationContact } from './ShipNavigation.js';

/** Shared game scene assembly and drawing. Asset/context ownership stays with its host. */
export function createCockpitScene(
  ship: Ship,
  modelRoot: Node3D,
  variants: readonly (readonly Mesh3D[])[],
) {
  const root = new Node3D('flight world'),
    rig = new Node3D('ship cockpit');
  const response = new CockpitResponse(ship);
  const { assembly, fit } = mountCockpitModel(modelRoot);
  const field = originalAsteroidField(2126, 72, variants, true);
  root.add(field).add(rig);
  rig.add(response.root);
  response.root.add(assembly);
  const instruments = new CockpitInstruments(ship);
  const displays = hi3dCockpitDisplays(
    { image: instruments.navigation.image },
    { image: instruments.computer.image },
    instruments.overhead.map((d) => ({ image: d.image })) as [
      { image: typeof instruments.navigation.image },
      { image: typeof instruments.navigation.image },
      { image: typeof instruments.navigation.image },
    ],
  );
  displays.transform = {
    ...displays.transform,
    position: { x: 0, y: -1.5, z: 0 },
  };
  // Final hand-fitted calibration from the rendering testbed, in source units.
  // These are asset placement values, independent of camera/viewport size.
  const displayOffsets = [
    [-0.01, 0.011], // navigation
    [-0.079, 0.011], // systems
    [0, -0.03], // attitude
    [0, -0.03], // speed
    [-0.007, -0.03], // position
  ] as const;
  displayOffsets.forEach(([x, y], index) => {
    const node = displays.children[index]!;
    node.transform = {
      ...node.transform,
      position: {
        x: node.transform.position.x + x,
        y: node.transform.position.y + y,
        z: node.transform.position.z,
      },
    };
  });
  fit.add(displays);
  const lamps = hi3dCockpitLamps();
  lamps.root.transform = displays.transform;
  lamps.setCockpitScale(0.8, 0.93);
  const lampOffsets = [
    [0.008, -0.015], // overhead left
    [-0.014, -0.012], // overhead right
    [0.003, 0.01], // centre console
    [-0.021, 0.035], // right console
    [0.009, -0.058], // amber alert
    [-0.038, -0.058], // red alert
  ] as const;
  lampOffsets.forEach(([x, y], index) => {
    const node = lamps.root.children[index]!;
    node.transform = {
      ...node.transform,
      position: {
        x: node.transform.position.x + x,
        y: node.transform.position.y + y,
        z: node.transform.position.z,
      },
    };
  });
  lamps.setSize(4, 0.686);
  lamps.setSize(5, 0.686);
  fit.add(lamps.root);
  const pilotEye = { x: 0, y: 1.48, z: -3.37 };
  const hud = new WindshieldHud();
  const windshield = new WindshieldSurface(modelRoot, hud, pilotEye);
  const camera = new PerspectiveCamera();
  camera.near = 0.05;
  camera.far = 100000;
  const sun = distantSun();
  root.add(sun.node);
  const sunDirection = { x: -0.6, y: 0.35, z: -0.72 };
  const contacts: NavigationContact[] = field.children
    .slice(0, 12)
    .map((n, i) => ({
      id: `rock-${i + 1}`,
      label: `Asteroid ${String(i + 1).padStart(2, '0')}`,
      positionM: matrixPoint(n.worldMatrix(), { x: 0, y: 0, z: 0 }),
      arrivalRadiusM: 100,
    }));
  ship.navigation.setContacts(contacts);
  ship.navigation.selectDestination(contacts[0]!.id);
  return {
    root,
    instruments,
    hud,
    windshield,
    update(dt: number) {
      response.update(dt);
    },
    draw(
      renderer: WebGLMeshRenderer3D,
      width: number,
      height: number,
      sky: TextureImage,
    ) {
      const b = ship.telemetry.body,
        p = b.positionM;
      const r = ship.body.localToWorld({ x: 1, y: 0, z: 0 }),
        u = ship.body.localToWorld({ x: 0, y: 1, z: 0 }),
        f = ship.body.localToWorld({ x: 0, y: 0, z: 1 });
      const pose: Matrix4 = [
        r.x,
        r.y,
        r.z,
        0,
        u.x,
        u.y,
        u.z,
        0,
        f.x,
        f.y,
        f.z,
        0,
        p.x,
        p.y,
        p.z,
        1,
      ];
      rig.matrix = pose;
      const eye = matrixPoint(pose, pilotEye);
      camera.x = eye.x;
      camera.y = eye.y;
      camera.z = eye.z;
      camera.yaw = b.yawRadians;
      camera.pitch = b.pitchRadians;
      camera.roll = b.rollRadians;
      sun.update(eye, sunDirection);
      lamps.setPowered(0, true);
      lamps.setPowered(1, true);
      lamps.setPowered(2, ship.telemetry.engine.activityFraction > 0);
      lamps.setPowered(3, ship.telemetry.dampers.activityFraction > 0);
      lamps.setPowered(
        4,
        ship.computer.telemetry.alerts.some((a) => a.severity === 'warning'),
      );
      lamps.setPowered(
        5,
        ship.computer.telemetry.alerts.some((a) => a.severity === 'critical'),
      );
      hud.update(instruments.status);
      return renderer.render(root, camera, width, height, {
        clearColor: [0, 0, 0],
        background: { image: sky, yaw: Math.PI / 2 },
        lights: [
          { kind: 'ambient', color: [1, 1, 1], intensity: 0.015 },
          {
            kind: 'directional',
            color: [1, 0.97, 0.9],
            intensity: 1.1,
            direction: sunDirection,
          },
        ],
        lightingEnabled: true,
        materialResponseEnabled: true,
        normalMappingEnabled: true,
      });
    },
    click(x: number, y: number, width: number, height: number) {
      // HUD glyphs are presentation, not selectable occluders. The authored
      // cockpit (including invisible panes) and dashboard compete by hit depth.
      const projection = new Set<Node3D>([windshield.screen]);
      hud.root.traverse((node) => projection.add(node));
      const hit = pickMesh3D(
        assembly,
        camera,
        width,
        height,
        x,
        y,
        (node) => !projection.has(node),
      );
      if (hit && hit.node === displays.children[1] && hit.uv)
        instruments.clickComputer(
          hit.uv[0] * instruments.computer.image.width,
          hit.uv[1] * instruments.computer.image.height,
        );
      if (hit?.node === displays.children[0]) instruments.nextDestination();
    },
  };
}
