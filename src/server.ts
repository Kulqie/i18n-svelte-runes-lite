/**
 * SvelteKit Server Hook for i18n locale persistence
 *
 * This "Magic Hook" provides:
 * 1. HttpOnly cookie-based locale persistence (secure)
 * 2. Automatic <html lang="..."> injection for SSR
 * 3. Virtual endpoint for client-side locale changes
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createI18nHook } from 'i18n-svelte-runes-lite/server';
 *
 * const i18nHook = createI18nHook({
 *     fallbackLocale: 'en',
 *     supportedLocales: ['en', 'pl', 'de']
 * });
 *
 * export const handle = i18nHook;
 *
 * // Or compose with other hooks:
 * import { sequence } from '@sveltejs/kit/hooks';
 * export const handle = sequence(i18nHook, otherHook);
 * ```
 *
 * @example
 * ```ts
 * // src/routes/+layout.server.ts
 * export const load = async ({ locals }) => {
 *     return { locale: locals.locale };
 * };
 * ```
 */

import type { Handle, RequestEvent } from '@sveltejs/kit';
import type { SharedI18nConfig } from './types';
import { validateStorageKey } from './config';

/**
 * Configuration options for the i18n server hook
 */
export interface HookOptions {
    /**
     * Shared configuration for consistent server/client settings.
     * Values from shared config are used as defaults for other options.
     *
     * Priority: explicit option > shared config > hardcoded default
     *
     * @example
     * ```ts
     * import { createSharedConfig } from 'i18n-svelte-runes-lite/config';
     *
     * const sharedConfig = createSharedConfig({
     *     fallbackLocale: 'en',
     *     supportedLocales: ['en', 'pl']
     * });
     *
     * export const handle = createI18nHook({ shared: sharedConfig });
     * ```
     */
    shared?: SharedI18nConfig;

    /**
     * Default locale when no preference is set
     * @default 'en'
     */
    fallbackLocale?: string;

    /**
     * List of supported locale codes for validation
     * If not provided, any locale value is accepted
     */
    supportedLocales?: string[];

    /**
     * Key name for storing locale preference (cookie name).
     * Preferred over deprecated `cookieName`.
     *
     * @default 'locale'
     */
    storageKey?: string;

    /**
     * Cookie name for storing locale preference
     * @deprecated Use `storageKey` instead for consistency with client config
     * @default 'locale'
     */
    cookieName?: string;

    /**
     * Endpoint path for the locale save bridge
     * Must match the `persistenceEndpoint` in client config
     * @default '/__i18n/save'
     */
    endpoint?: string;

    /**
     * Cookie max age in seconds
     * @default 31536000 (1 year)
     */
    cookieMaxAge?: number;

    /**
     * Cookie path
     * @default '/'
     */
    cookiePath?: string;

    /**
     * Cookie SameSite attribute
     * @default 'lax'
     */
    cookieSameSite?: 'strict' | 'lax' | 'none';

    /**
     * Whether to set Secure flag on cookie (requires HTTPS)
     * @default true in production, false in development
     */
    cookieSecure?: boolean;
}

/**
 * Creates a SvelteKit server hook for i18n locale management
 *
 * Features:
 * - Reads locale from HttpOnly cookie and sets `event.locals.locale`
 * - Intercepts `/__i18n/save` endpoint to persist locale to HttpOnly cookie
 * - Transforms HTML response to inject correct `<html lang="...">` attribute
 *
 * @param options - Hook configuration
 * @returns SvelteKit Handle function
 */
export function createI18nHook(options: HookOptions = {}): Handle {
    const { shared } = options;

    // Resolution priority: explicit option > shared config > hardcoded default
    // IMPORTANT: shared config takes priority over deprecated explicit options
    // to encourage migration to centralized configuration
    const fallbackLocale = options.fallbackLocale ?? shared?.fallbackLocale ?? 'en';
    const supportedLocales = options.supportedLocales ?? shared?.supportedLocales;
    // storageKey takes priority; deprecated cookieName is checked last for backwards compat
    // Shared config is preferred over deprecated cookieName to prevent accidental override
    const cookieName = options.storageKey ?? shared?.storageKey ?? options.cookieName ?? 'locale';

    // Validate storage key to prevent cookie parsing issues
    // This catches invalid characters (;, =, etc.) that would break cookie headers
    // Shared config already validates this, but direct options bypass that validation
    validateStorageKey(cookieName, 'createI18nHook');

    const endpoint = options.endpoint ?? shared?.endpoint ?? '/__i18n/save';
    // Cookie attributes: explicit > shared > hardcoded default
    const cookieMaxAge = options.cookieMaxAge ?? shared?.cookieMaxAge ?? 31536000; // 1 year
    const cookiePath = options.cookiePath ?? shared?.cookiePath ?? '/';
    const cookieSameSite = options.cookieSameSite ?? shared?.cookieSameSite ?? 'lax';
    const cookieSecure = options.cookieSecure ?? shared?.cookieSecure;

    // Respect warnOnAutoFix from shared config (for consistency with client-side)
    // Currently unused but available for future warning additions
    const warnOnAutoFix = shared?.warnOnAutoFix ?? true;

    // Helper for conditional warnings (respects warnOnAutoFix setting)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const warnAuto = (message: string) => {
        if (warnOnAutoFix) {
            console.warn(message);
        }
    };

    // Create case-insensitive lookup map for O(1) locale validation
    // Maps lowercase locale -> original casing (e.g., 'en-us' -> 'en-US')
    // This fixes the case sensitivity bug where 'pl-pl' wouldn't match 'pl-PL'
    const supportedMap = supportedLocales
        ? new Map(supportedLocales.map(l => [l.toLowerCase(), l]))
        : null;

    /**
     * Validate and normalize a locale string (case-insensitive)
     * Returns the locale in its canonical casing if valid, or fallback if invalid
     */
    function validateLocale(locale: string | undefined | null): string {
        if (!locale || typeof locale !== 'string') {
            return fallbackLocale;
        }

        const trimmed = locale.trim();
        if (!trimmed) {
            return fallbackLocale;
        }

        const lowerTrimmed = trimmed.toLowerCase();

        // If supportedLocales is configured, validate against it (case-insensitive)
        if (supportedMap) {
            // Direct match (case-insensitive)
            const exactMatch = supportedMap.get(lowerTrimmed);
            if (exactMatch) {
                return exactMatch;
            }

            // Try base language (e.g., 'en-US' -> 'en')
            const baseLang = lowerTrimmed.split('-')[0];
            if (baseLang !== lowerTrimmed) {
                const baseMatch = supportedMap.get(baseLang);
                if (baseMatch) {
                    return baseMatch;
                }
            }

            // Try finding a regional variant for base language (e.g., 'en' -> 'en-US')
            // This handles the case where server receives 'en' but only 'en-US' is supported
            for (const [lowerLocale, originalLocale] of supportedMap) {
                if (lowerLocale.startsWith(baseLang + '-')) {
                    return originalLocale;
                }
            }

            return fallbackLocale;
        }

        // Basic validation: alphanumeric with optional hyphen (e.g., 'en', 'en-US', 'zh-Hans')
        if (/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(trimmed)) {
            return trimmed;
        }

        return fallbackLocale;
    }

    /**
     * Determine if cookie should be secure based on environment
     */
    function isSecure(event: RequestEvent): boolean {
        if (cookieSecure !== undefined) {
            return cookieSecure;
        }
        // Auto-detect: secure in production or when using HTTPS
        return event.url.protocol === 'https:';
    }

    return async function handle({ event, resolve }) {
        // --- 1. READ LOCALE FROM COOKIE ---
        const cookieValue = event.cookies.get(cookieName);
        const locale = validateLocale(cookieValue);

        // Set locale in locals for use in load functions
        // Cast to any since App.Locals is defined by the user's app
        (event.locals as Record<string, unknown>).locale = locale;

        // --- 2. HANDLE LOCALE SAVE ENDPOINT ---
        // Normalize pathname to handle SvelteKit's trailingSlash configuration
        // This ensures /api/i18n/ matches /api/i18n regardless of project settings
        const normalizedPathname = event.url.pathname.replace(/\/+$/, '') || '/';
        if (normalizedPathname === endpoint && event.request.method === 'POST') {
            try {
                const body = await event.request.json();
                const newLocale = validateLocale(body?.locale);

                // Set HttpOnly cookie
                event.cookies.set(cookieName, newLocale, {
                    path: cookiePath,
                    maxAge: cookieMaxAge,
                    sameSite: cookieSameSite,
                    secure: isSecure(event),
                    httpOnly: true
                });

                return new Response(JSON.stringify({ success: true, locale: newLocale }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('[i18n-svelte-runes-lite] Error in locale save endpoint:', error);
                return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // --- 3. RESOLVE AND TRANSFORM HTML ---
        return resolve(event, {
            transformPageChunk: ({ html }) => {
                // Strategy: Handle all possible <html> configurations
                // 1. %lang% placeholder (recommended) -> replace with locale
                // 2. Existing lang="..." or lang='...' -> update value
                // 3. No lang attribute at all -> inject lang attribute

                // First, replace %lang% placeholder if present
                let result = html.replace(/%lang%/g, locale);

                // Check if we already have a lang attribute (after placeholder replacement)
                const hasLangAttr = /<html[^>]*\slang\s*=/.test(result);

                if (hasLangAttr) {
                    // Update existing lang attribute (double or single quotes)
                    result = result
                        .replace(/(<html[^>]*\slang\s*=\s*)"[^"]*"/, `$1"${locale}"`)
                        .replace(/(<html[^>]*\slang\s*=\s*)'[^']*'/, `$1'${locale}'`);
                } else {
                    // No lang attribute - inject one after <html
                    result = result.replace(/<html(\s|>)/, `<html lang="${locale}"$1`);
                }

                return result;
            }
        });
    };
}

/**
 * Helper to extend SvelteKit's App.Locals type
 *
 * Add this to your src/app.d.ts:
 * ```ts
 * declare global {
 *     namespace App {
 *         interface Locals {
 *             locale: string;
 *         }
 *     }
 * }
 * export {};
 * ```
 */
export interface I18nLocals {
    locale: string;
}

/**
 * Type-safe helper to get locale from event.locals
 * @param locals - event.locals object
 * @param fallback - Fallback locale if not set
 */
export function getLocaleFromLocals(locals: App.Locals, fallback = 'en'): string {
    return (locals as I18nLocals).locale || fallback;
}
