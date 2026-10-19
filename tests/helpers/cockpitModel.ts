import { readFile } from 'node:fs/promises';
import { parseGlb, TextureImage } from '../../src/3d/index.js';
import { mountCockpitModel } from '../../games/ship/CockpitModel.js';

/** Real geometry/hierarchy; tiny decoded image fixtures keep CPU tests DOM-free. */
export async function cockpitModel() {
  const bytes = await readFile(
    new URL(
      '../../../examples/3d/assets/cockpit-hi3d-v3-smartglass.glb',
      import.meta.url,
    ),
  );
  const model = parseGlb(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    {
      resolveImage: (_index, colorSpace) =>
        new TextureImage(1, 1, new Uint8Array([255, 255, 255, 255]), {
          colorSpace,
        }),
    },
  );
  const instance = model.instantiate();
  return {
    ...mountCockpitModel(instance.root),
    modelRoot: instance.root,
    model,
  };
}
