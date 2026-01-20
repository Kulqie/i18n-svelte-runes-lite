/**
 * Shared Configuration Helper for i18n-svelte-runes-lite
 *
 * This module provides utilities for creating consistent i18n configuration
 * that can be shared between server hooks and client-side initialization.
 *
 * @example
 * ```ts
 * // src/lib/i18n/config.ts
 * import { createSharedConfig } from 'i18n-svelte-runes-lite/config';
 *
 * export const sharedConfig = createSharedConfig({
 *     fallbackLocale: 'en',
 *     supportedLocales: ['en', 'pl', 'de'],
 *     storageKey: 'app-locale'
 * });
 * ```
 */

import type { SharedI18nConfig } from './types';

/**
 * Default values for shared configuration
 */
const DEFAULTS: SharedI18nConfig = {
    fallbackLocale: 'en',
    storageKey: 'locale',
    endpoint: '/__i18n/save',
    warnOnAutoFix: true
};

/**
 * Regex pattern for valid storage key characters.
 * - Must start with alphanumeric (some systems treat leading dots/hyphens as special)
 * - Rest can be: alphanumeric, hyphen, underscore, dot
 * - Disallows: semicolon, equals, comma, space (break cookie parsing)
 */
export const VALID_STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Maximum allowed length for storage key
 */
export const MAX_STORAGE_KEY_LENGTH = 64;

/**
 * Creates a validated, frozen shared configuration object.
 *
 * This helper applies sensible defaults and validates the configuration
 * to prevent common mistakes like invalid endpoint paths.
 *
 * @param config - Partial configuration to merge with defaults
 * @returns Frozen SharedI18nConfig object
 *
 * @example Basic usage
 * ```ts
 * const config = createSharedConfig({
 *     fallbackLocale: 'en',
 *     supportedLocales: ['en', 'pl', 'de']
 * });
 * // Uses default storageKey='locale' and endpoint='/__i18n/save'
 * ```
 *
 * @example Custom storage key
 * ```ts
 * const config = createSharedConfig({
 *     fallbackLocale: 'en',
 *     storageKey: 'app-locale',
 *     endpoint: '/api/i18n/save'
 * });
 * ```
 *
 * @throws {Error} If fallbackLocale is not a string or is empty
 * @throws {Error} If storageKey is not a string, is empty, or contains invalid characters
 * @throws {Error} If endpoint is not a string, is empty, or doesn't start with '/'
 * @throws {Error} If supportedLocales is not an array (when provided)
 * @throws {Error} If supportedLocales is an empty array
 * @throws {Error} If supportedLocales contains non-string or empty string values
 */
export function createSharedConfig(config: Partial<SharedI18nConfig> = {}): Readonly<SharedI18nConfig> {
    // --- Type Validation (before any operations that assume type) ---

    // Validate fallbackLocale type first (before .trim())
    const rawFallbackLocale = config.fallbackLocale ?? DEFAULTS.fallbackLocale;
    if (typeof rawFallbackLocale !== 'string') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: fallbackLocale must be a string, ` +
            `got ${typeof rawFallbackLocale}: ${JSON.stringify(rawFallbackLocale)}`
        );
    }

    // Validate storageKey type first (before .trim())
    const rawStorageKey = config.storageKey ?? DEFAULTS.storageKey;
    if (typeof rawStorageKey !== 'string') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: storageKey must be a string, ` +
            `got ${typeof rawStorageKey}: ${JSON.stringify(rawStorageKey)}`
        );
    }

    // Validate endpoint type first (before .trim())
    const rawEndpoint = config.endpoint ?? DEFAULTS.endpoint;
    if (typeof rawEndpoint !== 'string') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: endpoint must be a string, ` +
            `got ${typeof rawEndpoint}: ${JSON.stringify(rawEndpoint)}`
        );
    }

    // Validate supportedLocales is an array if provided (before spread)
    if (config.supportedLocales !== undefined && !Array.isArray(config.supportedLocales)) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: supportedLocales must be an array, ` +
            `got ${typeof config.supportedLocales}: ${JSON.stringify(config.supportedLocales)}`
        );
    }

    // Validate warnOnAutoFix type if provided
    if (config.warnOnAutoFix !== undefined && typeof config.warnOnAutoFix !== 'boolean') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: warnOnAutoFix must be a boolean, ` +
            `got ${typeof config.warnOnAutoFix}: ${JSON.stringify(config.warnOnAutoFix)}`
        );
    }

    // Validate cookieMaxAge type and value if provided
    if (config.cookieMaxAge !== undefined) {
        if (typeof config.cookieMaxAge !== 'number') {
            throw new Error(
                `[i18n-svelte-runes-lite] createSharedConfig: cookieMaxAge must be a number, ` +
                `got ${typeof config.cookieMaxAge}: ${JSON.stringify(config.cookieMaxAge)}`
            );
        }
        if (config.cookieMaxAge < 0 || !Number.isFinite(config.cookieMaxAge)) {
            throw new Error(
                `[i18n-svelte-runes-lite] createSharedConfig: cookieMaxAge must be a non-negative finite number, ` +
                `got ${config.cookieMaxAge}`
            );
        }
    }

    // Validate cookiePath type if provided
    if (config.cookiePath !== undefined && typeof config.cookiePath !== 'string') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: cookiePath must be a string, ` +
            `got ${typeof config.cookiePath}: ${JSON.stringify(config.cookiePath)}`
        );
    }

    // Validate cookieSameSite value if provided (whitelist check)
    const validSameSiteValues = ['strict', 'lax', 'none'] as const;
    if (config.cookieSameSite !== undefined && !validSameSiteValues.includes(config.cookieSameSite)) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: cookieSameSite must be one of 'strict', 'lax', or 'none', ` +
            `got '${config.cookieSameSite}'`
        );
    }

    // Validate cookieSecure type if provided
    if (config.cookieSecure !== undefined && typeof config.cookieSecure !== 'boolean') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: cookieSecure must be a boolean, ` +
            `got ${typeof config.cookieSecure}: ${JSON.stringify(config.cookieSecure)}`
        );
    }

    // Validate SameSite=none requires Secure=true (browser requirement since Chrome 80+)
    // Browsers will reject cookies with SameSite=None if Secure is not set
    // We require EXPLICIT cookieSecure=true, not just "not false", because auto-detection
    // would fail on HTTP localhost and silently break the cookie
    if (config.cookieSameSite === 'none' && config.cookieSecure !== true) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: cookieSameSite='none' requires explicit cookieSecure=true. ` +
            `Modern browsers reject SameSite=None cookies without the Secure flag. ` +
            `Set cookieSecure: true in your config.`
        );
    }

    // --- Apply defaults and trim (safe now that types are validated) ---
    // Normalize endpoint: trim and remove trailing slashes to prevent client/server mismatch
    // If input is "/" or "///", ensure it stays "/" instead of becoming empty
    const normalizedEndpoint = rawEndpoint.trim().replace(/\/+$/, '') || '/';

    // Normalize cookiePath: default to '/' if empty (empty path breaks site-wide persistence)
    const normalizedCookiePath = config.cookiePath?.trim() || undefined;

    const merged: SharedI18nConfig = {
        fallbackLocale: rawFallbackLocale.trim(),
        supportedLocales: config.supportedLocales ? [...config.supportedLocales] : undefined,
        storageKey: rawStorageKey.trim(),
        endpoint: normalizedEndpoint,
        warnOnAutoFix: config.warnOnAutoFix ?? DEFAULTS.warnOnAutoFix,
        // Cookie attributes (optional, undefined means "use defaults" in server.ts/index.svelte.ts)
        cookieMaxAge: config.cookieMaxAge,
        // Empty cookiePath defaults to undefined (which becomes '/' in server.ts/index.svelte.ts)
        cookiePath: normalizedCookiePath === '' ? undefined : normalizedCookiePath,
        cookieSameSite: config.cookieSameSite,
        cookieSecure: config.cookieSecure
    };

    // Helper for conditional warnings (respects warnOnAutoFix setting)
    const warn = (message: string) => {
        if (merged.warnOnAutoFix) {
            console.warn(message);
        }
    };

    // --- Value Validation ---

    // Validate fallbackLocale is non-empty after trimming
    if (merged.fallbackLocale === '') {
        throw new Error(
            '[i18n-svelte-runes-lite] createSharedConfig: fallbackLocale must be a non-empty string'
        );
    }

    // Validate endpoint is non-empty after trimming and normalization
    // This catches cases like endpoint: '' or endpoint: '///' (which normalizes to '')
    if (merged.endpoint === '') {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: endpoint must be a non-empty path starting with '/'. ` +
            `Got empty string after normalization.`
        );
    }

    // Validate endpoint starts with /
    if (!merged.endpoint.startsWith('/')) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: endpoint must start with '/', got '${merged.endpoint}'`
        );
    }

    // Validate storageKey is non-empty after trimming
    if (merged.storageKey === '') {
        throw new Error(
            '[i18n-svelte-runes-lite] createSharedConfig: storageKey must be a non-empty string'
        );
    }

    // Validate storageKey contains only valid cookie/localStorage key characters
    // Uses the shared VALID_STORAGE_KEY_PATTERN constant defined below
    if (!VALID_STORAGE_KEY_PATTERN.test(merged.storageKey)) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: storageKey '${merged.storageKey}' is invalid. ` +
            `Must start with alphanumeric and contain only alphanumeric, hyphens (-), underscores (_), and dots (.).`
        );
    }

    // Warn about dots in storageKey (can cause issues with legacy server parsers)
    if (merged.storageKey.includes('.')) {
        warn(
            `[i18n-svelte-runes-lite] createSharedConfig: storageKey '${merged.storageKey}' contains dots. ` +
            `This may cause issues with some server-side parsers (PHP, older Express body-parsers) ` +
            `that map cookie names with dots to nested objects.`
        );
    }

    // Validate storageKey length (reasonable limit to prevent performance issues)
    // Uses the shared MAX_STORAGE_KEY_LENGTH constant defined above
    if (merged.storageKey.length > MAX_STORAGE_KEY_LENGTH) {
        throw new Error(
            `[i18n-svelte-runes-lite] createSharedConfig: storageKey '${merged.storageKey.substring(0, 20)}...' ` +
            `exceeds maximum length of ${MAX_STORAGE_KEY_LENGTH} characters (got ${merged.storageKey.length}).`
        );
    }

    // Validate supportedLocales
    if (merged.supportedLocales) {
        // Reject empty array
        if (merged.supportedLocales.length === 0) {
            throw new Error(
                '[i18n-svelte-runes-lite] createSharedConfig: supportedLocales cannot be an empty array'
            );
        }

        // Validate each item is a string first (before any trim operation)
        for (let i = 0; i < merged.supportedLocales.length; i++) {
            const locale = merged.supportedLocales[i];
            if (typeof locale !== 'string') {
                throw new Error(
                    `[i18n-svelte-runes-lite] createSharedConfig: supportedLocales[${i}] must be a string, ` +
                    `got ${typeof locale}: ${JSON.stringify(locale)}`
                );
            }
        }

        // Trim all locale values (safe now that we know they're strings)
        merged.supportedLocales = merged.supportedLocales.map(l => l.trim());

        // Validate no empty strings after trimming
        for (let i = 0; i < merged.supportedLocales.length; i++) {
            if (merged.supportedLocales[i] === '') {
                throw new Error(
                    `[i18n-svelte-runes-lite] createSharedConfig: supportedLocales[${i}] is empty or whitespace-only`
                );
            }
        }

        // Remove duplicates (case-insensitive, preserves first occurrence's casing)
        const seenLower = new Set<string>();
        const uniqueLocales: string[] = [];
        const removedDuplicates: string[] = [];
        for (const locale of merged.supportedLocales) {
            const lower = locale.toLowerCase();
            if (seenLower.has(lower)) {
                removedDuplicates.push(locale);
            } else {
                seenLower.add(lower);
                uniqueLocales.push(locale);
            }
        }
        if (removedDuplicates.length > 0) {
            warn(
                `[i18n-svelte-runes-lite] createSharedConfig: duplicate locales detected and removed from supportedLocales: ${removedDuplicates.join(', ')}`
            );
            merged.supportedLocales = uniqueLocales;
        }

        // Ensure fallbackLocale is included with consistent casing
        // This fixes the "casing mismatch" bug where Set.has() lookups fail
        // if supportedLocales contains 'en-us' but fallbackLocale is 'en-US'
        const fallbackLower = merged.fallbackLocale.toLowerCase();
        const existingIndex = merged.supportedLocales.findIndex(l => l.toLowerCase() === fallbackLower);

        if (existingIndex === -1) {
            // Not found at all - add fallbackLocale to the list
            warn(
                `[i18n-svelte-runes-lite] createSharedConfig: fallbackLocale '${merged.fallbackLocale}' ` +
                `was not in supportedLocales. Adding it automatically.`
            );
            merged.supportedLocales = [merged.fallbackLocale, ...merged.supportedLocales];
        } else if (merged.supportedLocales[existingIndex] !== merged.fallbackLocale) {
            // Found with different casing - normalize to match fallbackLocale exactly
            // This ensures Set.has(fallbackLocale) will succeed in the core library
            const original = merged.supportedLocales[existingIndex];
            merged.supportedLocales[existingIndex] = merged.fallbackLocale;
            warn(
                `[i18n-svelte-runes-lite] createSharedConfig: normalized locale casing '${original}' → '${merged.fallbackLocale}' ` +
                `to match fallbackLocale (required for Set lookups).`
            );
        }
    }

    // Deep freeze: freeze the supportedLocales array if present
    if (merged.supportedLocales) {
        Object.freeze(merged.supportedLocales);
    }

    // Return frozen object to prevent accidental mutation
    return Object.freeze(merged);
}

// Re-export the type for convenience
export type { SharedI18nConfig } from './types';

// --- EXPORTED VALIDATION HELPERS ---
// These can be used by server.ts to validate direct options (without shared config)
// Note: VALID_STORAGE_KEY_PATTERN and MAX_STORAGE_KEY_LENGTH are defined above and exported

/**
 * Validate a storage key for use in cookies/localStorage.
 * Throws an error if the key is invalid.
 *
 * @param key - The storage key to validate
 * @param context - Context string for error messages (e.g., 'createI18nHook')
 * @throws {Error} If key is invalid
 */
export function validateStorageKey(key: string, context: string = 'validateStorageKey'): void {
    if (typeof key !== 'string') {
        throw new Error(
            `[i18n-svelte-runes-lite] ${context}: storageKey must be a string, ` +
            `got ${typeof key}: ${JSON.stringify(key)}`
        );
    }

    const trimmed = key.trim();
    if (trimmed === '') {
        throw new Error(
            `[i18n-svelte-runes-lite] ${context}: storageKey must be a non-empty string`
        );
    }

    if (!VALID_STORAGE_KEY_PATTERN.test(trimmed)) {
        throw new Error(
            `[i18n-svelte-runes-lite] ${context}: storageKey '${trimmed}' is invalid. ` +
            `Must start with alphanumeric and contain only alphanumeric, hyphens (-), underscores (_), and dots (.).`
        );
    }

    if (trimmed.length > MAX_STORAGE_KEY_LENGTH) {
        throw new Error(
            `[i18n-svelte-runes-lite] ${context}: storageKey '${trimmed.substring(0, 20)}...' ` +
            `exceeds maximum length of ${MAX_STORAGE_KEY_LENGTH} characters (got ${trimmed.length}).`
        );
    }
}
