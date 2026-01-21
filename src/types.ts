// --- GENERIC LIBRARY TYPES ---

// --- SHARED CONFIGURATION ---

/**
 * Shared configuration for consistent server/client i18n settings.
 *
 * This interface unifies the configuration between server hooks and client-side
 * i18n initialization, ensuring consistent behavior across the application.
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
 *
 * // hooks.server.ts
 * createI18nHook({ shared: sharedConfig });
 *
 * // +layout.svelte
 * createI18n({ shared: sharedConfig, translations, initialLocale: data.locale });
 * ```
 */
export interface SharedI18nConfig {
    /**
     * Default locale when no preference is set.
     * Used by both server hook (as default) and client (as fallback).
     */
    fallbackLocale: string;

    /**
     * List of supported locale codes for validation.
     * If not provided, any locale value is accepted.
     */
    supportedLocales?: string[];

    /**
     * Unified key name for storing locale preference.
     * Used as cookie name on server and localStorage/cookie key on client.
     *
     * This replaces the confusing dual naming:
     * - Server: was `cookieName`
     * - Client: was `storageKey`
     *
     * @default 'locale'
     */
    storageKey: string;

    /**
     * Unified endpoint path for the locale save bridge.
     * Must be the same on server (intercepts) and client (sends requests).
     *
     * This replaces the confusing dual naming:
     * - Server: was `endpoint`
     * - Client: was `persistenceEndpoint`
     *
     * @default '/__i18n/save'
     */
    endpoint: string;

    /**
     * Whether to emit console warnings when auto-fixing configuration issues.
     *
     * When true (default), warnings are logged for:
     * - Duplicate locales being removed from supportedLocales
     * - Locale casing normalization
     *
     * Set to false in production SSR environments to avoid log flooding
     * on every cold start or edge function invocation.
     *
     * @default true
     */
    warnOnAutoFix?: boolean;

    // --- COOKIE ATTRIBUTES (for client/server synchronization) ---

    /**
     * Cookie max age in seconds.
     * Used by both server hook and client-side cookie fallback.
     *
     * @default 31536000 (1 year)
     */
    cookieMaxAge?: number;

    /**
     * Cookie path attribute.
     * Must match between server and client to avoid duplicate cookies.
     *
     * @default '/'
     */
    cookiePath?: string;

    /**
     * Cookie SameSite attribute.
     * Must match between server and client.
     *
     * @default 'lax'
     */
    cookieSameSite?: 'strict' | 'lax' | 'none';

    /**
     * Whether to set Secure flag on cookie (requires HTTPS).
     * If not set, auto-detected based on protocol.
     *
     * @default undefined (auto-detect)
     */
    cookieSecure?: boolean;
}

// --- PERSISTENCE TYPES ---

/**
 * Strategy for persisting locale preference across sessions
 * - 'cookie': Use document.cookie (client-side, not HttpOnly)
 * - 'localStorage': Use localStorage (best for Wails/SPA without server)
 * - 'bridge': Use server endpoint for HttpOnly cookie (most secure, SvelteKit)
 * - 'auto': Auto-detect based on environment (default)
 * - 'none': No persistence
 */
export type PersistenceStrategy = 'cookie' | 'localStorage' | 'bridge' | 'auto' | 'none';

/**
 * Environment type for auto-detection override
 * - 'sveltekit': SvelteKit with server hooks available (uses bridge)
 * - 'wails': Desktop app - Wails, Tauri, or Electron (uses localStorage)
 * - 'spa': Client-side SPA without server (uses client-side cookie)
 * - 'auto': Auto-detect based on window globals (default)
 *
 * Note: 'wails' is used for all desktop frameworks (Wails, Tauri, Electron)
 * because they all share the same persistence strategy (localStorage).
 */
export type EnvironmentType = 'sveltekit' | 'wails' | 'spa' | 'auto';

/**
 * Recursive type to generate dot-notation keys from a schema
 * @example
 * type Schema = { nav: { dashboard: string } };
 * // Results in: "nav" | "nav.dashboard"
 */
export type TranslationPaths<T> = T extends object
  ? {
      [K in keyof T]: `${Exclude<K, symbol>}${"" | `.${TranslationPaths<T[K]>}`}`;
    }[keyof T]
  : never;

// --- ADVANCED TYPE SAFETY FOR PARAMS ---

/**
 * Extract {{param}} placeholders from a translation string at compile time
 * Supports hyphenated keys like {{user-name}} and dot notation like {{user.name}}
 * @example ExtractParams<"Hello {{name}}!"> // => "name"
 * @example ExtractParams<"{{count}} items"> // => "count"
 * @example ExtractParams<"Hello {{user-name}}!"> // => "user-name"
 */
type ExtractParams<Str extends string> = Str extends `${string}{{${infer Param}}}${infer Rest}`
  ? Param | ExtractParams<Rest>
  : never;

/**
 * Trim leading and trailing whitespace from a string type
 */
type TrimStart<S extends string> = S extends ` ${infer Rest}` ? TrimStart<Rest> : S;
type TrimEnd<S extends string> = S extends `${infer Rest} ` ? TrimEnd<Rest> : S;
type Trim<S extends string> = TrimStart<TrimEnd<S>>;

/**
 * Clean format specifiers from param names and trim whitespace
 * @example CleanParam<"date, date"> // => "date"
 * @example CleanParam<"price, currency, USD"> // => "price"
 * @example CleanParam<" name "> // => "name"
 */
type CleanParam<P extends string> = P extends `${infer Key},${string}`
  ? Trim<Key>
  : Trim<P>;

/**
 * Navigate object type by dot-notation path
 * @example GetPathValue<{nav: {title: string}}, "nav.title"> // => string
 */
type GetPathValue<T, P extends string> =
  P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T ? GetPathValue<T[Key], Rest> : never
    : P extends keyof T ? T[P] : never;

/**
 * Generate required params type from schema and key
 * Forces TypeScript to error on missing/misspelled params
 *
 * @example
 * // Schema: { welcome: "Hello {{name}}!" }
 * I18nParams<Schema, "welcome"> // => { name: string | number | Date }
 *
 * // Schema: { simple: "No params here" }
 * I18nParams<Schema, "simple"> // => void
 */
export type I18nParams<Schema, Key extends TranslationPaths<Schema>> =
  GetPathValue<Schema, Key> extends string
    ? ExtractParams<GetPathValue<Schema, Key>> extends never
      ? void // No params required
      : { [K in ExtractParams<GetPathValue<Schema, Key>> as CleanParam<K>]: string | number | Date }
    : Record<string, any>; // Fallback for objects (pluralization)

/**
 * Configuration object passed to createI18n
 * @template Schema - The shape of your translation objects (e.g., typeof en)
 */
export interface I18nConfig<Schema extends object> {
    /**
     * Shared configuration for consistent server/client settings.
     * Values from shared config are used as defaults for other options.
     *
     * Priority: explicit option > shared config > hardcoded default
     *
     * @example
     * ```ts
     * const i18n = createI18n({
     *     shared: sharedConfig,
     *     translations: { en, pl },
     *     initialLocale: data.locale
     * });
     * ```
     */
    shared?: SharedI18nConfig;

    /** Dictionary of all loaded languages (for eager loading) */
    translations?: Record<string, Schema | any>;
    /** Async loaders for lazy loading translations (optional) */
    loaders?: Record<string, () => Promise<Schema | any>>;
    /** Initial locale to use (default: 'en') */
    initialLocale?: string;
    /** Fallback locale when translation is missing (default: 'en') */
    fallbackLocale?: string;
    /** Debug mode: shows keys instead of translations (default: false) */
    debug?: boolean;
    /**
     * Callback when a translation key is missing in the current locale.
     * Useful for logging/tracking missing translations in production.
     * @param key - The missing translation key
     * @param locale - The locale where the key was missing
     */
    onMissingKey?: (key: string, locale: string) => void;

    /**
     * Strict SSR mode: throws if initialLocale is not explicitly provided.
     * Use this in SvelteKit apps to ensure hydration safety.
     *
     * When enabled, the library will throw an error instead of auto-detecting
     * the locale from `<html lang>`, forcing developers to explicitly pass
     * `initialLocale` from their server-side page data.
     */
    strictSSR?: boolean;

    /**
     * Pre-loaded translations from SSR for hydration alignment.
     *
     * When using lazy loading with SSR, the server loads translations async,
     * but the client needs them synchronously during hydration. Pass the
     * server-loaded translations here to prevent hydration mismatch.
     *
     * @example SvelteKit usage
     * ```ts
     * // +layout.server.ts
     * export const load = async ({ cookies }) => {
     *     const locale = cookies.get('locale') || 'en';
     *     const translations = await import(`./locales/${locale}.json`);
     *     return { locale, translations: translations.default };
     * };
     *
     * // +layout.svelte
     * const { data } = $props();
     * const i18n = createI18n({
     *     loaders: { en: () => import('./locales/en.json'), pl: () => import('./locales/pl.json') },
     *     initialLocale: data.locale,
     *     ssrLoadedTranslations: { [data.locale]: data.translations }
     * });
     * ```
     */
    ssrLoadedTranslations?: Record<string, Schema | any>;

    // --- PERSISTENCE OPTIONS ---

    /**
     * Strategy for persisting locale preference across sessions.
     * - 'cookie': Use document.cookie (client-side, not HttpOnly)
     * - 'localStorage': Use localStorage (best for Wails/SPA without server)
     * - 'bridge': Use server endpoint for HttpOnly cookie (most secure, SvelteKit)
     * - 'auto': Auto-detect based on environment (default)
     * - 'none': No persistence
     *
     * @default 'auto'
     */
    strategy?: PersistenceStrategy;

    /**
     * Endpoint for bridge strategy (server-side cookie persistence).
     * The Magic Hook intercepts requests to this endpoint.
     *
     * @default '/__i18n/save'
     */
    persistenceEndpoint?: string;

    /**
     * Auto-reload page after bridge persistence completes.
     * Useful when server-side rendering needs to reflect the new locale.
     *
     * @default false
     */
    reloadOnChange?: boolean;

    /**
     * Called when locale changes. Return translations for the new locale.
     * Useful for dynamic loading in SvelteKit namespaced mode.
     *
     * This hook is called BEFORE the locale is actually changed, allowing
     * you to load translations asynchronously. If the hook returns translations,
     * they are merged into the translations store.
     *
     * Race condition safe: if multiple locale changes happen quickly,
     * only the latest one takes effect.
     *
     * @example
     * ```ts
     * setI18n({
     *     translations: data.translations ?? {},
     *     initialLocale: data.locale ?? defaultLocale,
     *     onLocaleChange: async (newLocale) => {
     *         const namespaces = ['common'];
     *         return await loadLocale(newLocale, namespaces);
     *     }
     * });
     * ```
     */
    onLocaleChange?: (newLocale: string, oldLocale: string) => Promise<Schema | void>;

    /**
     * Override automatic environment detection.
     * - 'sveltekit': Force bridge strategy (assumes server hooks available)
     * - 'wails': Force localStorage strategy
     * - 'spa': Force cookie strategy
     * - 'auto': Auto-detect (default)
     *
     * @default 'auto'
     */
    environment?: EnvironmentType;

    /**
     * Key name for storing locale in localStorage/cookie.
     * Must match `cookieName` in server hook config for bridge strategy.
     *
     * @default 'locale'
     */
    storageKey?: string;
}

/**
 * Parameters for interpolation in translations
 * Supports {{var}} syntax and special 'count' key for pluralization
 */
export interface InterpolationParams {
    /** Special key for pluralization logic */
    count?: number;
    /** Dynamic variables for interpolation */
    [key: string]: string | number | Date | undefined;
}

// --- NAMESPACE TYPES ---

/**
 * Namespace loader configuration
 * Maps namespace names to async import functions
 */
export interface NamespaceLoaders {
    [namespace: string]: () => Promise<any>;
}

/**
 * Extended configuration with namespace support
 * @template Schema - The shape of your translation objects
 */
export interface I18nConfigWithNamespaces<Schema extends object> extends I18nConfig<Schema> {
    /**
     * Namespace loaders per locale
     * Structure: { en: { dashboard: () => import(...), admin: () => import(...) }, pl: { ... } }
     */
    namespaceLoaders?: Record<string, NamespaceLoaders>;
    /** Default namespace to use when none specified (default: 'common') */
    defaultNamespace?: string;

    /**
     * Pre-mark namespaces as loaded from SSR.
     *
     * When SSR provides pre-loaded translations via `ssrLoadedTranslations`, the client
     * receives a flat merged object and doesn't know which namespaces were already loaded.
     * This causes:
     * 1. `isNamespaceLoaded('common')` returns `false` incorrectly
     * 2. `loadNamespace('common')` tries to re-fetch already-loaded data
     * 3. Components may show loading states for already-loaded content
     *
     * Pass the list of namespaces that were loaded during SSR to fix this.
     *
     * @example
     * ```ts
     * // +page.server.ts
     * export const load = async ({ locals }) => {
     *     const locale = locals.locale;
     *     const common = await import(`$lib/i18n/locales/${locale}/common.json`);
     *     const dashboard = await import(`$lib/i18n/locales/${locale}/dashboard.json`);
     *
     *     return {
     *         ssrTranslations: { ...common.default, ...dashboard.default },
     *         loadedNamespaces: ['common', 'dashboard']
     *     };
     * };
     *
     * // +layout.svelte
     * setI18n({
     *     namespaceLoaders,
     *     initialLocale: data.locale,
     *     ssrLoadedTranslations: { [data.locale]: data.ssrTranslations },
     *     ssrLoadedNamespaces: { [data.locale]: data.loadedNamespaces }
     * });
     * ```
     */
    ssrLoadedNamespaces?: Record<string, string[]>;
}
