/**
 * Test helpers index
 *
 * Re-exports all test utilities for convenient importing.
 *
 * @example
 * ```ts
 * import { createConsoleMocks, restoreConsoleMocks, type SpyInstance } from './helpers';
 * ```
 */
export {
    createConsoleMocks,
    restoreConsoleMocks,
    createWarnSpy,
    createErrorSpy,
    expectWarningContaining,
    expectNoWarnings,
    type ConsoleMocks,
    type SpyInstance
} from './console-mock';
