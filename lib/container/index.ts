/**
 * Barrel export for the DI container module.
 *
 * Intent: Provide a single import path for container access and typed resolution.
 */

export { createAppContainer, getAppContainer, disposeContainer } from './container';
export type { Cradle, TypedContainer, ServiceScope } from './types';

// ─── Typed helper ────────────────────────────────────────────────────────────

import type { Cradle } from './types';
import { getAppContainer } from './container';

/**
 * Resolve a service by name with full type safety.
 *
 * @param name - Key in the {@link Cradle} interface.
 * @returns The resolved service instance.
 * @throws {AwilixResolutionError} if the service is not registered.
 *
 * @example
 * ```ts
 * const log = getService('logger');
 * log.info('ready');
 * ```
 */
export function getService<K extends keyof Cradle>(name: K): Cradle[K] {
  return getAppContainer().resolve(name);
}
