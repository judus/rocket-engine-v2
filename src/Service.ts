import type { Frame, FixedFrame, Scene } from './types.js';

/** Optional synchronous app services. Consumers receive dependencies explicitly. */
export interface Service {
  start?(activeScenes: ReadonlySet<Scene>): undefined;
  stop?(): undefined;
  /** Synchronous activation boundary, including between RAF callbacks. */
  scenesChanged?(activeScenes: ReadonlySet<Scene>): undefined;
  beforeUpdate?(frame: Frame, activeScenes: ReadonlySet<Scene>): undefined;
  beforeFixedUpdate?(
    frame: FixedFrame,
    activeScenes: ReadonlySet<Scene>,
  ): undefined;
  dispose?(): undefined;
}
export type ServiceType<T extends Service> = new () => T;
