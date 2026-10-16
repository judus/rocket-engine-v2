export { PerspectiveCamera } from './PerspectiveCamera.js';
export type { Vec3, ScreenPoint, ProjectedPoint } from './PerspectiveCamera.js';
export { transformPoint } from './Transform3D.js';
export type { Transform3D } from './Transform3D.js';
export {
  identityMatrix,
  multiplyMatrices,
  transformMatrix,
  matrixPoint,
} from './Matrix4.js';
export type { Matrix4 } from './Matrix4.js';
export { MeshGeometry, Mesh3D } from './Mesh3D.js';
export type { GeometryFace, Material3D } from './Mesh3D.js';
export { Node3D } from './Node3D.js';
export { CanvasRenderer3D } from './CanvasRenderer3D.js';
export { collectFaces } from './collectFaces.js';
export { SoftwareDepthRenderer3D } from './SoftwareDepthRenderer3D.js';
export type { DepthRenderStats } from './SoftwareDepthRenderer3D.js';
export { projectFaces } from './SolidFaces.js';
export type { Face, ProjectedFace } from './SolidFaces.js';
export { parseGlb, loadGlb } from './GlbModel.js';
export type { GlbModel, GlbInstance, GlbCamera } from './GlbModel.js';

export { shadeFaces } from './Lighting3D.js';
export type {
  LinearColor,
  Light3D,
  AmbientLight3D,
  DirectionalLight3D,
  PointLight3D,
} from './Lighting3D.js';

export { normalMatrix } from './NormalMatrix.js';

export { TextureImage, DynamicTextureImage } from './TextureImage.js';
export type { TextureSource3D } from './TextureImage.js';
export type {
  TextureBinding3D,
  TextureWrap,
  TextureFilter,
} from './TextureImage.js';

export { embeddedGlbImages } from './GlbModel.js';
export type { EmbeddedGlbImage } from './GlbModel.js';

export {
  EnvironmentMap,
  bakeEnvironment,
  cubeDirection,
} from './EnvironmentMap.js';
export type { CubeFaces, EnvironmentLight3D } from './EnvironmentMap.js';

export { directionalShadowMatrix } from './DirectionalShadow.js';
export type { DirectionalShadow3D } from './DirectionalShadow.js';
