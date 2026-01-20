/**
 * Test helper utilities for console mocking
 *
 * Provides reusable console spy fixtures to reduce test boilerplate
 * and ensure consistent mocking across test files.
 */
import { vi, expect } from 'vitest';

/** Type for vitest spy instance */
export type SpyInstance = ReturnType<typeof vi.spyOn>;

/**
 * Console spy collection type
 */
export interface ConsoleMocks {
    log: SpyInstance;
    warn: SpyInstance;
    error: SpyInstance;
    debug: SpyInstance;
}

/**
 * Creates mock spies for all common console methods
 *
 * @example
 * ```ts
 * let mocks: ConsoleMocks;
 *
 * beforeEach(() => {
 *     mocks = createConsoleMocks();
 * });
 *
 * afterEach(() => {
 *     restoreConsoleMocks(mocks);
 * });
 *
 * it('warns about missing key', () => {
 *     someFunction();
 *     expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
 * });
 * ```
 */
export function createConsoleMocks(): ConsoleMocks {
    return {
        log: vi.spyOn(console, 'log').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {})
    };
}

/**
 * Restores all console mocks to their original implementations
 *
 * @param mocks - The console mocks to restore
 */
export function restoreConsoleMocks(mocks: ConsoleMocks): void {
    mocks.log.mockRestore();
    mocks.warn.mockRestore();
    mocks.error.mockRestore();
    mocks.debug.mockRestore();
}

/**
 * Creates a single console.warn spy (for backwards compatibility)
 *
 * @example
 * ```ts
 * let warnSpy: SpyInstance;
 *
 * beforeEach(() => {
 *     warnSpy = createWarnSpy();
 * });
 *
 * afterEach(() => {
 *     warnSpy.mockRestore();
 * });
 * ```
 */
export function createWarnSpy(): SpyInstance {
    return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

/**
 * Creates a single console.error spy
 */
export function createErrorSpy(): SpyInstance {
    return vi.spyOn(console, 'error').mockImplementation(() => {});
}

/**
 * Asserts that a console method was called with a message containing the specified substring
 *
 * @param spy - The console spy to check
 * @param substring - The substring to search for in the message
 *
 * @example
 * ```ts
 * expectWarningContaining(mocks.warn, 'missing key');
 * ```
 */
export function expectWarningContaining(spy: SpyInstance, substring: string): void {
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(substring));
}

/**
 * Asserts that a console method was NOT called
 *
 * @param spy - The console spy to check
 */
export function expectNoWarnings(spy: SpyInstance): void {
    expect(spy).not.toHaveBeenCalled();
}
