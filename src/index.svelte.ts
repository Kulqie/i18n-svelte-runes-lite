import { translateInternal, formatters } from './core';
import type { I18nConfig, I18nConfigWithNamespaces, TranslationPaths, InterpolationParams, NamespaceLoaders, I18nParams, PersistenceStrategy, EnvironmentType, SharedI18nConfig } from './types';

// --- ENVIRONMENT DETECTION ---

/**
 * Escape special regex characters in a string
 * Used when building RegExp from user-provided values like storageKey
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect the runtime environment based on global objects
 * Used for auto-selecting persistence strategy
 */
function detectEnvironment(): 'sveltekit' | 'wails' | 'spa' {
    if (typeof window === 'undefined') {
        // Server-side rendering context - likely SvelteKit but could be other SSR frameworks
        // Using 'sveltekit' as default since this library is Svelte-focused
        return 'sveltekit';
    }

    // Check for Wails runtime (Go desktop app framework)
    // Wails injects 'runtime' or 'Wails' on the window object
    if ((window as any).runtime || (window as any).Wails) {
        return 'wails';
    }

    // Check for Tauri (Rust desktop app framework)
    // Tauri injects '__TAURI__' on the window object
    if ((window as any).__TAURI__) {
        return 'wails'; // Treat like Wails - use localStorage
    }

    // Check for Electron (via contextBridge or process)
    // Note: Modern Electron uses contextBridge, older versions expose process
    if ((window as any).electronAPI || (window as any).process?.versions?.electron) {
        return 'wails'; // Treat like Wails - use localStorage
    }

    // Check for SvelteKit indicators
    // Priority order for reliability:
    // 1. __sveltekit_dev / __sveltekit_app - globals set by SvelteKit (most reliable)
    // 2. Check for SvelteKit's navigation/page stores in window
    // 3. data-sveltekit-* attributes on links (preload hints)
    // 4. Hydration markers (timing-dependent, may be removed after hydration)
    if (
        (window as any).__sveltekit_dev ||
        (window as any).__sveltekit_app ||
        (window as any).__sveltekit_1ng0suo // SvelteKit internal namespace (version-specific but common)
    ) {
        return 'sveltekit';
    }

    // Secondary check: look for SvelteKit-specific elements
    // Check for preload links which are more persistent than hydration markers
    if (
        document.querySelector('link[rel="modulepreload"][href*="/_app/"]') ||
        document.querySelector('script[src*="/_app/"]') ||
        document.querySelector('[data-sveltekit-preload-data]') ||
        document.querySelector('[data-sveltekit-preload-code]')
    ) {
        return 'sveltekit';
    }

    // Default to SPA for browser environments without framework indicators
    // This prevents unnecessary bridge requests for pure client-side apps
    return 'spa';
}

/**
 * Resolve the actual persistence strategy and detected environment based on config.
 * Returns both to avoid duplicate detectEnvironment() calls.
 */
function resolveStrategyAndEnv<Schema extends object>(config: I18nConfig<Schema>): {
    strategy: PersistenceStrategy;
    detectedEnv: 'sveltekit' | 'wails' | 'spa';
} {
    const detectedEnv = config.environment === 'auto' || !config.environment
        ? detectEnvironment()
        : config.environment;

    if (config.strategy && config.strategy !== 'auto') {
        return { strategy: config.strategy, detectedEnv };
    }

    let strategy: PersistenceStrategy;
    switch (detectedEnv) {
        case 'wails': strategy = 'localStorage'; break;
        case 'spa': strategy = 'cookie'; break;
        case 'sveltekit':
        default: strategy = 'bridge'; break;
    }

    return { strategy, detectedEnv };
}

/**
 * Creates a new i18n instance with full type safety
 * This is the main entry point for the library
 *
 * @example
 * ```ts
 * import { createI18n } from 'i18n-svelte-runes-lite';
 * import en from './locales/en.json';
 * import pl from './locales/pl.json';
 *
 * type Schema = typeof en;
 *
 * const i18n = createI18n<Schema>({
 *     translations: { en, pl },
 *     initialLocale: 'en',
 *     fallbackLocale: 'en'
 * });
 *
 * export const t = i18n.t;
 * export const locale = i18n.locale;
 * ```
 */
/**
 * Detect the initial locale from various sources based on persistence strategy.
 *
 * Priority order:
 * 1. <html lang="..."> (SSR hydration alignment - highest priority)
 * 2. localStorage (for Wails/SPA with localStorage strategy)
 * 3. document.cookie (for SPA with cookie strategy)
 * 4. Fallback locale
 *
 * @param supportedLocales - Set of locales that have translations or loaders
 * @param fallback - Fallback locale if detection fails
 * @param strategy - Resolved persistence strategy
 * @param storageKey - Key name for localStorage/cookie (default: 'locale')
 * @returns Detected locale or fallback
 *
 * SECURITY NOTE: Reading document.documentElement.lang, localStorage, and cookies
 * is safe - values are only used as dictionary keys after validation.
 */
function detectInitialLocale(
    supportedLocales: Set<string>,
    fallback: string,
    strategy: PersistenceStrategy,
    storageKey: string = 'locale',
    warnOnAutoFix: boolean = true
): string {
    // Server-side: no document/window available, use fallback
    if (typeof document === 'undefined') {
        return fallback;
    }

    // Create case-insensitive lookup map for validation
    // Maps lowercase locale -> original casing (e.g., 'en-us' -> 'en-US')
    const supportedMap = new Map(
        Array.from(supportedLocales).map(l => [l.toLowerCase(), l])
    );

    /**
     * Helper to validate a locale string against supported locales (case-insensitive)
     * Returns the locale in its canonical casing if valid, or null if invalid
     */
    function validateLocale(locale: string | null | undefined): string | null {
        if (!locale || typeof locale !== 'string') return null;

        const trimmed = locale.trim();
        if (!trimmed) return null;

        const lowerTrimmed = trimmed.toLowerCase();

        // Check direct match (case-insensitive)
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
        // This handles the case where server sends 'en' but client only has 'en-US'
        for (const [lowerLocale, originalLocale] of supportedMap) {
            if (lowerLocale.startsWith(baseLang + '-')) {
                return originalLocale;
            }
        }

        return null;
    }

    // --- 1. Check HTML lang attribute (SSR hydration alignment) ---
    const htmlLang = document.documentElement.lang;

    // Common template placeholder patterns that indicate SSR didn't set the lang
    const templatePatterns = [
        /^%\w+%$/,        // %lang%
        /^\{\{\w+\}\}$/,  // {{lang}}
        /^\$\{\w+\}$/,    // ${lang}
        /^\[\w+\]$/,      // [lang]
    ];

    if (htmlLang && !templatePatterns.some(pattern => pattern.test(htmlLang))) {
        const validated = validateLocale(htmlLang);
        if (validated) {
            return validated;
        }

        // Detected locale not supported - warn if enabled
        if (warnOnAutoFix) {
            console.warn(
                `[i18n-svelte-runes-lite] Detected server locale '${htmlLang}' from <html lang> ` +
                `but no translations found. Checking other sources...`
            );
        }
    }

    // --- 2. Check localStorage (for Wails/SPA with localStorage strategy) ---
    if (strategy === 'localStorage') {
        try {
            const stored = localStorage.getItem(storageKey);
            const validated = validateLocale(stored);
            if (validated) {
                return validated;
            }
        } catch {
            // localStorage may be unavailable (SSR, iframe restrictions, etc.)
        }
    }

    // --- 3. Check cookie (for SPA with cookie strategy) ---
    // NOTE: 'bridge' strategy is excluded because it uses HttpOnly cookies
    // which cannot be read via document.cookie. For bridge strategy,
    // locale detection relies on <html lang> set by the server hook.
    if (strategy === 'cookie') {
        try {
            // Build regex dynamically to match configurable storage key
            // SECURITY: Escape storageKey to prevent regex injection if key contains special chars
            const cookieRegex = new RegExp(`(?:^|;\\s*)${escapeRegex(storageKey)}=([^;]+)`);
            const match = document.cookie.match(cookieRegex);
            if (match) {
                const validated = validateLocale(decodeURIComponent(match[1]));
                if (validated) {
                    return validated;
                }
            }
        } catch {
            // Cookie parsing may fail in edge cases
        }
    }

    return fallback;
}

export function createI18n<Schema extends object>(config: I18nConfig<Schema> | I18nConfigWithNamespaces<Schema>) {
    // --- SHARED CONFIG RESOLUTION ---
    //
    // Priority: explicit option > shared config > hardcoded default
    // This allows users to use a shared config while still overriding individual values.
    //
    const { shared } = config;

    // --- MERGE TRANSLATIONS WITH SSR-LOADED DATA ---
    //
    // SSR HYDRATION FIX: When using lazy loading, the server loads translations
    // async and renders HTML. The client needs those same translations SYNCHRONOUSLY
    // during hydration to avoid mismatch. The `ssrLoadedTranslations` config allows
    // passing pre-loaded translations from the server (via page data).
    //
    // Priority: ssrLoadedTranslations > config.translations (merged)
    //
    const rawTranslations: Record<string, Schema | any> = {
        ...(config.translations || {}),
        ...(config.ssrLoadedTranslations || {})
    };
    const rawLoaders = config.loaders || {};
    // Resolution: explicit > shared > hardcoded default
    const fallbackLocale = config.fallbackLocale ?? shared?.fallbackLocale ?? 'en';

    // --- CASING NORMALIZATION ---
    // If shared.supportedLocales is provided, it defines the canonical casing.
    // Normalize translation/loader keys to match this casing to prevent
    // "casing fragmentation" where 'en-us' and 'en-US' coexist as different keys.
    //
    // Example: supportedLocales: ['en-US'], translations: { 'en-us': {...} }
    // After normalization: translations: { 'en-US': {...} }
    //
    const canonicalCasingMap = shared?.supportedLocales
        ? new Map(shared.supportedLocales.map(l => [l.toLowerCase(), l]))
        : null;

    /**
     * Normalize locale keys in an object to match canonical casing from supportedLocales.
     * Returns a new object with normalized keys.
     */
    function normalizeLocaleKeys<T>(obj: Record<string, T>): Record<string, T> {
        if (!canonicalCasingMap) return obj;

        const normalized: Record<string, T> = {};
        for (const [key, value] of Object.entries(obj)) {
            const canonical = canonicalCasingMap.get(key.toLowerCase());
            // Use canonical casing if available, otherwise keep original
            normalized[canonical ?? key] = value;
        }
        return normalized;
    }

    // Normalize keys before creating reactive state
    const mergedTranslations = normalizeLocaleKeys(rawTranslations);
    const loaders = normalizeLocaleKeys(rawLoaders);
    const translations: Record<string, Schema | any> = $state(mergedTranslations);

    // Track available locales from translations, loaders, ssr-loaded, AND shared config
    // Keys are already normalized, so Set will have consistent casing
    const allLocales = new Set([
        ...Object.keys(mergedTranslations),
        ...Object.keys(loaders),
        ...(shared?.supportedLocales || [])
    ]);

    // Create case-insensitive lookup map for locale validation
    // Maps lowercase -> original casing to handle 'en-us' -> 'en-US' lookups
    const allLocalesMap = new Map(
        Array.from(allLocales).map(l => [l.toLowerCase(), l])
    );

    /**
     * Case-insensitive locale lookup
     * Returns the correctly-cased locale if found, or null if not supported
     */
    function findLocale(locale: string): string | null {
        // Direct match first (most common case)
        if (allLocales.has(locale)) {
            return locale;
        }
        // Case-insensitive fallback
        return allLocalesMap.get(locale.toLowerCase()) ?? null;
    }

    // --- PERSISTENCE CONFIGURATION ---
    const { strategy: persistenceStrategy, detectedEnv } = resolveStrategyAndEnv(config);
    // Resolution: explicit > shared > hardcoded default
    const persistenceEndpoint = config.persistenceEndpoint ?? shared?.endpoint ?? '/__i18n/save';
    const reloadOnChange = config.reloadOnChange ?? false;
    const storageKey = config.storageKey ?? shared?.storageKey ?? 'locale';
    // Cookie attributes for client-side cookie fallback (must match server hook)
    const cookieMaxAge = shared?.cookieMaxAge ?? 31536000; // 1 year
    const cookiePath = shared?.cookiePath ?? '/';
    const cookieSameSite = shared?.cookieSameSite ?? 'lax';
    // cookieSecure: explicit shared value, or auto-detect from protocol
    // Required for sameSite='none' to work in modern browsers
    const cookieSecure = shared?.cookieSecure ?? (typeof location !== 'undefined' && location.protocol === 'https:');

    // --- WARNING CONFIGURATION ---
    // Respect warnOnAutoFix from shared config (defaults to true for backwards compatibility)
    const warnOnAutoFix = shared?.warnOnAutoFix ?? true;

    // Helper for conditional warnings (respects warnOnAutoFix setting)
    const warnAuto = (message: string) => {
        if (warnOnAutoFix) {
            console.warn(message);
        }
    };

    // Warn about potential storage key mismatch with server hook
    // Two scenarios require warning:
    // 1. Not using shared config with custom storageKey → potential mismatch with server
    // 2. Using shared config but explicitly overriding storageKey → user may have created mismatch
    if (persistenceStrategy === 'bridge') {
        const hasExplicitStorageKey = config.storageKey !== undefined;
        const isNonDefaultKey = storageKey !== 'locale';
        const overridesSharedConfig = shared && hasExplicitStorageKey && config.storageKey !== shared.storageKey;

        if (overridesSharedConfig) {
            // Case 2: User explicitly overrides shared config's storageKey
            warnAuto(
                `[i18n-svelte-runes-lite] Explicit storageKey '${config.storageKey}' overrides shared config's ` +
                `storageKey '${shared.storageKey}'. This may cause server/client mismatch.\n` +
                `Remove the explicit storageKey to use the shared config value, or update your server hook to match.`
            );
        } else if (!shared && hasExplicitStorageKey && isNonDefaultKey) {
            // Case 1: No shared config with custom storageKey
            warnAuto(
                `[i18n-svelte-runes-lite] Using bridge strategy with custom storageKey '${config.storageKey}'. ` +
                `Make sure your server hook's storageKey matches: createI18nHook({ storageKey: '${config.storageKey}' })\n` +
                `Tip: Use createSharedConfig() to ensure server/client consistency automatically.`
            );
        }
    }

    // --- STRICT SSR MODE CHECK ---
    //
    // If strictSSR is enabled, require explicit initialLocale to prevent
    // reliance on auto-detection which can cause hydration issues.
    //
    if (config.strictSSR && !config.initialLocale) {
        throw new Error(
            '[i18n-svelte-runes-lite] strictSSR is enabled but no initialLocale provided. ' +
            'Pass initialLocale from page.data for guaranteed hydration safety.'
        );
    }

    // --- SMART LOCALE INITIALIZATION ---
    //
    // Priority order for initial locale:
    // 1. Explicit `config.initialLocale` (developer knows best)
    // 2. Auto-detected from `<html lang="...">` (SSR hydration alignment)
    // 3. localStorage (for Wails/SPA environments)
    // 4. document.cookie (for SPA environments)
    // 5. `config.fallbackLocale` or 'en' (last resort)
    //
    // This "smart" detection prevents hydration mismatches in most cases:
    // - Server renders page in 'pl' with <html lang="pl">
    // - Client boots, sees lang="pl", initializes with 'pl'
    // - Translations match → no hydration error!
    //
    // If you need full control, always pass `initialLocale` explicitly.
    //
    // Validate explicit initialLocale against supported locales (case-insensitive)
    // This catches configuration errors early instead of silently falling back
    // Also normalizes casing: 'en-us' -> 'en-US' if that's how it's defined
    const normalizedInitialLocale = config.initialLocale ? findLocale(config.initialLocale) : null;

    if (config.initialLocale && !normalizedInitialLocale) {
        warnAuto(
            `[i18n-svelte-runes-lite] Explicit initialLocale '${config.initialLocale}' is not in supported locales. ` +
            `Available: [${Array.from(allLocales).join(', ')}]. Falling back to '${fallbackLocale}'.`
        );
    }

    const initialLocale = normalizedInitialLocale
        ?? detectInitialLocale(allLocales, fallbackLocale, persistenceStrategy, storageKey, warnOnAutoFix);

    // Warn about potential hydration mismatch when auto-detected locale needs async loading
    // Skip warnings for desktop environments (Wails/Tauri/Electron) where:
    // 1. There's no SSR, so no hydration mismatch concern
    // 2. Assets are local, so async loading is typically <5ms
    // Note: detectedEnv is already computed by resolveStrategyAndEnv above
    const isDesktopEnv = detectedEnv === 'wails';

    // DEV MODE WARNING: SvelteKit without explicit initialLocale risks hydration mismatch
    // Note: This warning only shows when debug mode is enabled
    if (config.debug && detectedEnv === 'sveltekit' && !config.initialLocale) {
        console.warn(
            `[i18n-svelte-runes-lite] ⚠️ SvelteKit detected but 'initialLocale' is missing.\n` +
            `To prevent hydration mismatches, pass the locale from the server:\n\n` +
            `  // In +page.ts or +layout.ts:\n` +
            `  export const load = ({ data }) => ({ locale: data.locale });\n\n` +
            `  // In createI18n():\n` +
            `  createI18n({ initialLocale: data.locale, ... })\n\n` +
            `This warning only appears in development mode.`
        );
    }

    if (!config.initialLocale && typeof window !== 'undefined' && !isDesktopEnv) {
        const hasImmediateTranslations = !!mergedTranslations[initialLocale];
        const hasLoader = !!loaders[initialLocale];

        if (!hasImmediateTranslations && hasLoader) {
            warnAuto(
                `[i18n-svelte-runes-lite] Hydration warning: Detected locale '${initialLocale}' ` +
                `from <html lang> but translations must be loaded async. ` +
                `Pass ssrLoadedTranslations or initialLocale from page.data to prevent flicker.`
            );
        } else if (config.debug) {
            // General debug message for auto-detection (only when debug mode is enabled)
            console.debug(
                '[i18n-svelte-runes-lite] No initialLocale provided. Auto-detected from <html lang>. ' +
                'For guaranteed SSR hydration safety, pass initialLocale from page.data.'
            );
        }
    }

    let currentLocale = $state(initialLocale);

    // Validate that at least some translations or loaders are provided
    const hasTranslations = Object.keys(translations).length > 0;
    const hasLoaders = Object.keys(loaders).length > 0;
    if (!hasTranslations && !hasLoaders) {
        warnAuto('[i18n-svelte-runes-lite] No translations or loaders provided. All t() calls will return the key.');
    }
    // Track which locales are currently loading (Set-based for accurate current-locale tracking)
    // This fixes the "zombie loading" issue where isLoadingLocale stayed true for stale loads
    let localeLoadingSet = $state(new Set<string>());
    let localeRequestId = 0;
    let debugMode = $state(config.debug ?? false);
    const onMissingKey = config.onMissingKey;
    // Cache for in-flight locale loading promises to prevent duplicate loads
    const localeLoadingPromises: Map<string, Promise<void>> = new Map();

    // Namespace state (Feature D)
    const namespaceConfig = (config as I18nConfigWithNamespaces<Schema>).namespaceLoaders || {};
    const defaultNamespace = (config as I18nConfigWithNamespaces<Schema>).defaultNamespace || 'common';

    // --- SSR NAMESPACE TRACKING ---
    //
    // When SSR provides pre-loaded translations via `ssrLoadedTranslations`, the client
    // receives a flat merged object. Without `ssrLoadedNamespaces`, the client doesn't
    // know which namespaces were already loaded, causing:
    // 1. `isNamespaceLoaded('common')` returns `false` incorrectly
    // 2. `loadNamespace('common')` tries to re-fetch already-loaded data
    // 3. Components may show loading states for already-loaded content
    //
    // Initialize loadedNamespaces from ssrLoadedNamespaces config to fix this.
    //
    const ssrLoadedNamespaces = (config as I18nConfigWithNamespaces<Schema>).ssrLoadedNamespaces || {};

    // Track loaded namespaces per locale: { en: Set(['dashboard', 'admin']), pl: Set([...]) }
    //
    // REACTIVITY PATTERN NOTE (Immutable Set Assignment):
    // Svelte 5's $state proxy does NOT make Set/Map mutation operations reactive.
    // When we call `set.add(item)`, Svelte doesn't detect the change.
    //
    // Solution: We use an immutable pattern - always assign a NEW Set instead of
    // mutating the existing one. This triggers Svelte's proxy since it detects
    // property assignment to the $state object.
    //
    // IMPORTANT: Any code that modifies loadedNamespaces MUST use immutable pattern:
    //   loadedNamespaces[locale] = new Set([...loadedNamespaces[locale], item]);
    // NOT: loadedNamespaces[locale].add(item);
    //
    const loadedNamespaces: Record<string, Set<string>> = $state(
        Object.fromEntries(
            Object.entries(ssrLoadedNamespaces).map(([locale, namespaces]) =>
                [locale, new Set(namespaces)]
            )
        )
    );
    // Use counter instead of boolean to handle concurrent namespace loading (Issue #3 fix)
    let namespaceLoadingCount = $state(0);
    // Cache for in-flight namespace loading promises to prevent duplicate loads
    // Note: Race conditions are handled by caching promises per locale:namespace key,
    // allowing concurrent loads of different namespaces to complete independently
    const namespaceLoadingPromises: Map<string, Promise<void>> = new Map();

    // supportedLocales is derived from allLocales (computed earlier for detection)
    const supportedLocales = Array.from(allLocales);

    // NOTE: We do NOT set document.documentElement.lang during initialization.
    // This prevents hydration mismatches in SSR environments where the server
    // renders a different lang attribute. The lang attribute is only updated
    // when setLocale() is explicitly called. For SSR, use hooks.server.ts to
    // set the lang attribute server-side via transformPageChunk.

    // --- Actions ---

    /**
     * Dynamically load a locale's translations
     * @param locale - Locale code to load
     * @returns Promise that resolves when locale is loaded
     */
    async function loadLocale(locale: string): Promise<void> {
        if (translations[locale]) {
            return; // Already loaded
        }

        if (!loaders[locale]) {
            throw new Error(`[i18n-svelte-runes-lite] No loader defined for locale '${locale}'`);
        }

        // Check if already loading - return existing promise to prevent duplicate loads
        const existingPromise = localeLoadingPromises.get(locale);
        if (existingPromise) {
            return existingPromise;
        }

        // Capture the request ID at the start of this load operation.
        // If a newer setLocale() call is made while loading, this load is considered "stale"
        // and its loading state should not affect the UI (prevents zombie loading indicators).
        const loadStartRequestId = localeRequestId;

        // Create and cache the loading promise
        const loadPromise = (async () => {
            try {
                // Add locale to loading set (immutable pattern for Svelte reactivity)
                localeLoadingSet = new Set([...localeLoadingSet, locale]);
                const mod = await loaders[locale]();
                translations[locale] = mod.default || mod;
            } catch (error) {
                console.error(`[i18n-svelte-runes-lite] Failed to load locale '${locale}':`, error);
                throw error;
            } finally {
                // Remove locale from loading set (immutable pattern for Svelte reactivity)
                const newSet = new Set(localeLoadingSet);
                newSet.delete(locale);
                localeLoadingSet = newSet;
                localeLoadingPromises.delete(locale);

                // Debug: detect stale loads (only log when debug mode is enabled)
                if (loadStartRequestId !== localeRequestId && debugMode) {
                    console.debug(
                        `[i18n-svelte-runes-lite] Locale '${locale}' finished loading but user has since switched locales. ` +
                        `This is normal if the user rapidly changed languages.`
                    );
                }
            }
        })();

        localeLoadingPromises.set(locale, loadPromise);
        return loadPromise;
    }

    /**
     * Deep merge two objects (used for namespace merging)
     *
     * SECURITY: Skips __proto__, constructor, and prototype keys to prevent
     * prototype pollution attacks via malicious translation files.
     */
    const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

    /** Type for nested translation objects */
    type TranslationObject = Record<string, unknown>;

    function deepMerge(target: TranslationObject, source: TranslationObject): TranslationObject {
        const output: TranslationObject = { ...target };
        for (const key of Object.keys(source)) {
            // SECURITY: Prevent prototype pollution attacks
            if (UNSAFE_KEYS.has(key)) continue;

            const sourceVal = source[key];
            const targetVal = target[key];

            if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
                // FIX: Ensure target[key] is actually an object before merging.
                // If target[key] is a string (common in i18n) and source[key] is an object,
                // spreading the string would create corrupted state with numeric keys.
                const mergeTarget = (targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal))
                    ? targetVal as TranslationObject
                    : {};
                output[key] = deepMerge(mergeTarget, sourceVal as TranslationObject);
            } else {
                output[key] = sourceVal;
            }
        }
        return output;
    }

    /**
     * Load a namespace's translations for a specific locale
     * @param namespace - Namespace to load (e.g., 'dashboard', 'admin')
     * @param locale - Locale to load for (defaults to current locale)
     * @returns Promise that resolves when namespace is loaded
     */
    async function loadNamespace(namespace: string, locale?: string): Promise<void> {
        const targetLocale = locale || currentLocale;

        // Initialize loaded set for this locale if needed
        if (!loadedNamespaces[targetLocale]) {
            loadedNamespaces[targetLocale] = new Set<string>();
        }

        // Skip if already loaded
        if (loadedNamespaces[targetLocale].has(namespace)) {
            return;
        }

        // Check if loader exists for this locale and namespace
        const localeNamespaces = namespaceConfig[targetLocale];
        if (!localeNamespaces || !localeNamespaces[namespace]) {
            console.warn(`[i18n-svelte-runes-lite] No namespace loader for '${namespace}' in locale '${targetLocale}'`);
            return;
        }

        // Create unique key for this locale+namespace combination
        const cacheKey = `${targetLocale}:${namespace}`;

        // Check if already loading - return existing promise to prevent duplicate loads
        // This handles race conditions: concurrent calls for the same namespace return the same promise
        const existingPromise = namespaceLoadingPromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        // Create and cache the loading promise
        const loadPromise = (async () => {
            try {
                namespaceLoadingCount++;
                const mod = await localeNamespaces[namespace]();
                const namespaceData = mod.default || mod;

                // Deep merge namespace translations into existing translations
                if (!translations[targetLocale]) {
                    translations[targetLocale] = {};
                }
                translations[targetLocale] = deepMerge(translations[targetLocale], namespaceData);

                // Mark as loaded using immutable pattern (triggers Svelte reactivity)
                loadedNamespaces[targetLocale] = new Set([...loadedNamespaces[targetLocale], namespace]);
            } catch (error) {
                console.error(`[i18n-svelte-runes-lite] Failed to load namespace '${namespace}' for locale '${targetLocale}':`, error);
                throw error;
            } finally {
                namespaceLoadingCount--;
                namespaceLoadingPromises.delete(cacheKey);
            }
        })();

        namespaceLoadingPromises.set(cacheKey, loadPromise);
        return loadPromise;
    }

    /**
     * Persist locale preference based on configured strategy
     * Called internally after successful locale change
     *
     * @param locale - Locale to persist
     */
    async function persistLocale(locale: string): Promise<void> {
        // Skip persistence if strategy is 'none' or we're server-side
        if (persistenceStrategy === 'none' || typeof window === 'undefined') {
            return;
        }

        const actualStrategy = persistenceStrategy;

        try {
            switch (actualStrategy) {
                case 'localStorage':
                    // Wails/SPA: use localStorage
                    try {
                        localStorage.setItem(storageKey, locale);
                    } catch (e) {
                        warnAuto('[i18n-svelte-runes-lite] localStorage not available, falling back to cookie');
                        setCookie(locale, storageKey);
                    }
                    break;

                case 'cookie':
                    // SPA/static: use document.cookie (not HttpOnly)
                    setCookie(locale, storageKey);
                    break;

                case 'bridge':
                    // SvelteKit: use server endpoint for HttpOnly cookie
                    await persistViaBridge(locale);
                    break;

                default:
                    // 'auto' is resolved to concrete strategy by resolveStrategyAndEnv()
                    // 'none' returns early at the top of this function
                    break;
            }
        } catch (error) {
            console.error('[i18n-svelte-runes-lite] Failed to persist locale:', error);
        }
    }

    /**
     * Set a client-side cookie (not HttpOnly)
     * Uses cookie attributes from shared config to ensure consistency with server hook.
     * @param locale - Locale value to store
     * @param key - Cookie name (defaults to configured storageKey)
     */
    function setCookie(locale: string, key: string = storageKey): void {
        // Note: key is not URL-encoded to match the reading logic in detectInitialLocale()
        // which uses regex matching on the raw key. Value is encoded for safety.
        // Cookie attributes are resolved from shared config to match server hook
        // Secure flag is required for sameSite='none' to work in modern browsers
        const secureFlag = cookieSecure ? '; secure' : '';
        document.cookie = `${key}=${encodeURIComponent(locale)}; path=${cookiePath}; max-age=${cookieMaxAge}; samesite=${cookieSameSite}${secureFlag}`;
    }

    /**
     * Persist locale via server bridge endpoint
     * Falls back to client cookie if bridge fails (static/SSG deployment)
     */
    async function persistViaBridge(locale: string): Promise<void> {
        try {
            const response = await fetch(persistenceEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locale })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.success && reloadOnChange) {
                // Reload to get server-rendered content in new locale
                window.location.reload();
            }
        } catch (error) {
            // Bridge unavailable (static site, network error) - fallback to client cookie
            if (debugMode) {
                console.debug(
                    '[i18n-svelte-runes-lite] Bridge endpoint unavailable, falling back to client cookie. ' +
                    'This is normal for static/SSG deployments.'
                );
            }
            setCookie(locale, storageKey);
        }
    }

    /**
     * Change the current locale
     * @param newLocale - Locale code to switch to
     * @param lazyLoad - If true, load the locale if not already loaded (default: true)
     */
    async function setLocale(newLocale: string, lazyLoad: boolean = true): Promise<void> {
        const thisRequestId = ++localeRequestId;

        if (!translations[newLocale]) {
            if (lazyLoad && loaders[newLocale]) {
                try {
                    await loadLocale(newLocale);
                } catch (error) {
                    console.error(`[i18n-svelte-runes-lite] Failed to load locale '${newLocale}':`, error);
                    // Don't change locale if load failed
                    return;
                }
            } else {
                console.warn(`[i18n-svelte-runes-lite] Locale '${newLocale}' not found in translations.`);
                return;
            }
        }

        // Check if this is still the most recent request (race condition fix)
        if (thisRequestId !== localeRequestId) {
            return; // A newer request has been made - abort this one
        }

        currentLocale = newLocale;

        // Defer DOM mutation to avoid hydration mismatch in SSR environments.
        // Using queueMicrotask ensures the update happens after Svelte's hydration completes.
        if (typeof document !== 'undefined') {
            queueMicrotask(() => {
                document.documentElement.lang = newLocale;
            });
        }

        // Persist locale preference based on strategy
        // Note: This is fire-and-forget - we don't await to avoid blocking the UI
        persistLocale(newLocale);
    }

    // --- Main T Function ---

    /**
     * Translate a key with optional parameters
     * Type-safe: params are required only when the translation contains {{placeholders}}
     *
     * @param key - Translation key (dot notation, fully typed)
     * @param params - Interpolation parameters (required if translation has placeholders)
     * @returns Translated string
     *
     * @example In template (reactive automatically)
     * <h1>{t('welcome.title')}</h1>
     *
     * @example In script (MUST use $derived for reactivity)
     * // ✅ Reactive - updates when locale changes
     * let title = $derived(t('welcome.title'));
     *
     * // ❌ NOT reactive - captured at initialization, never updates
     * const title = t('welcome.title');
     *
     * @example With parameters
     * t('welcome', { name: 'Jan' }); // ✅ OK
     * t('welcome');                   // ❌ TS Error: missing 'name'
     */
    function t<K extends TranslationPaths<Schema>>(
        key: K,
        ...args: I18nParams<Schema, K> extends void ? [] : [params: I18nParams<Schema, K>]
    ): string {
        const params = args[0] as InterpolationParams | undefined;
        if (debugMode) {
            const paramStr = params
                ? ` {${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')}}`
                : '';
            return `[${key}]${paramStr}`;
        }
        return translateInternal(
            currentLocale,
            fallbackLocale,
            translations,
            key as string,
            params,
            onMissingKey
        );
    }

    // --- Formatters bound to state ---

    /**
     * Reactive formatters that use current locale
     */
    const fmt = {
        number: (n: number, opt?: Intl.NumberFormatOptions) =>
            formatters.number(n, currentLocale, opt),

        currency: (n: number, cur?: string) =>
            formatters.currency(n, currentLocale, cur),

        date: (d: Date | number | string, opt?: Intl.DateTimeFormatOptions) =>
            formatters.date(d, currentLocale, opt),

        list: (items: string[], opt?: Intl.ListFormatOptions) =>
            formatters.list(items, currentLocale, opt)
    };

    // --- Return Instance ---

    return {
        /**
         * Current locale (reactive getter)
         *
         * ⚠️ IMPORTANT: Always access through the i18n object for reactivity!
         *
         * ✅ CORRECT: {i18n.locale} in template, or $derived(() => i18n.locale) in script
         * ❌ WRONG: const { locale } = i18n; // Destructuring captures value, loses reactivity!
         *
         * @returns Current locale string
         */
        get locale() { return currentLocale; },

        /**
         * Get the current locale for SSR lang attribute
         * Use this in SvelteKit hooks to set the lang attribute server-side
         *
         * @example
         * // src/hooks.server.ts
         * export const handle: Handle = async ({ event, resolve }) => {
         *     const locale = event.locals.locale || 'en';
         *     return resolve(event, {
         *         transformPageChunk: ({ html }) => html.replace('%lang%', locale)
         *     });
         * };
         *
         * // src/app.html
         * <html lang="%lang%">
         */
        getLangForSSR(): string { return currentLocale; },

        /**
         * Loading state for async locale changes.
         * Returns true only if the CURRENT locale is being loaded,
         * not for stale/abandoned locale loads (fixes "zombie loading" issue).
         */
        get isLoadingLocale() { return localeLoadingSet.has(currentLocale); },

        /**
         * Check if ANY locale is currently being loaded.
         * Useful for global loading indicators that should show during any async operation.
         */
        get isAnyLocaleLoading() { return localeLoadingSet.size > 0; },

        /**
         * Loading state for async namespace changes
         * Returns true if ANY namespace is currently being loaded (handles concurrent loads)
         */
        get isLoadingNamespace() { return namespaceLoadingCount > 0; },

        /**
         * Load a locale's translations dynamically
         */
        loadLocale,

        /**
         * Load a namespace's translations dynamically
         * @example await loadNamespace('dashboard');
         */
        loadNamespace,

        /**
         * Change the current locale
         */
        setLocale,

        /**
         * Main translation function
         */
        t,

        /**
         * Reactive formatters (number, currency, date)
         */
        fmt,

        /**
         * All available locale codes
         */
        supportedLocales,

        /**
         * Check if a locale is supported
         */
        isLocaleSupported: (l: string) => allLocales.has(l),

        /**
         * Debug mode state (reactive getter)
         */
        get debug() { return debugMode; },

        /**
         * Enable/disable debug mode
         * In debug mode, t() returns keys instead of translations
         */
        setDebug: (enabled: boolean) => { debugMode = enabled; },

        /**
         * Check if a namespace is loaded for the current locale (reactive)
         *
         * Reactivity is automatic since loadedNamespaces is a $state object
         * and we use immutable Set assignment pattern for updates.
         */
        isNamespaceLoaded: (namespace: string, locale?: string) => {
            const targetLocale = locale || currentLocale;
            return loadedNamespaces[targetLocale]?.has(namespace) || false;
        },

        /**
         * Get list of available namespaces for a locale
         */
        getAvailableNamespaces: (locale?: string) => {
            const targetLocale = locale || currentLocale;
            return Object.keys(namespaceConfig[targetLocale] || {});
        },

        /**
         * Mark namespaces as already loaded from SSR for a specific locale.
         *
         * Use this in SvelteKit page components when server-side load functions
         * pre-load namespaces that the client doesn't know about yet.
         *
         * This is necessary because `setI18n()` is called once in +layout.svelte,
         * but different pages may load different namespaces in their +page.server.ts.
         * Without this, client-side navigation would re-fetch namespaces that
         * were already loaded by the server for the new page.
         *
         * @param locale - The locale these namespaces were loaded for
         * @param namespaces - Array of namespace names that were loaded
         *
         * @example
         * ```svelte
         * <!-- /admin/+page.svelte -->
         * <script>
         *     import { useI18n } from 'i18n-svelte-runes-lite/context';
         *
         *     let { data } = $props();
         *     const { addSsrLoadedNamespaces, t } = useI18n();
         *
         *     // Mark namespaces that server already loaded for this page
         *     addSsrLoadedNamespaces(data.locale, data.loadedNamespaces);
         * </script>
         *
         * <h1>{t('admin.title')}</h1>
         * ```
         */
        addSsrLoadedNamespaces: (locale: string, namespaces: string[]) => {
            if (!namespaces || namespaces.length === 0) return;

            // Get existing set or create empty one
            const existingSet = loadedNamespaces[locale] || new Set<string>();

            // Create new Set with existing + new namespaces (immutable pattern for reactivity)
            loadedNamespaces[locale] = new Set([...existingSet, ...namespaces]);
        }
    };
}

// Export generic types for consumers
export type { I18nConfig, I18nConfigWithNamespaces, TranslationPaths, InterpolationParams, NamespaceLoaders, I18nParams, PersistenceStrategy, EnvironmentType, SharedI18nConfig };

// Export TransRich component for component interpolation
export { default as TransRich } from './TransRich.svelte';

// Export component slot utilities
export { parseComponentSlots, hasComponentSlots, type SlotNode } from './parseComponentSlots';

// Export SvelteKit context utilities for SSR-safe usage
export { setI18n, useI18n, getLocale, getLocaleGetter, getTranslator, getLangForSSR, type I18nInstance } from './context.svelte';
