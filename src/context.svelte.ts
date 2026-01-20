import { setContext, getContext } from 'svelte';
import { createI18n } from './index.svelte';
import type { I18nConfig, I18nConfigWithNamespaces } from './types';

/** Type representing the i18n instance returned by createI18n */
export type I18nInstance<Schema extends object> = ReturnType<typeof createI18n<Schema>>;

/**
 * Context key for storing the i18n instance
 * Using Symbol ensures no collisions with other context providers
 */
const I18N_CONTEXT_KEY = Symbol('i18n-svelte-runes-lite');

/**
 * Sets up the i18n context for the component tree
 * Use this in your root layout (e.g., +layout.svelte in SvelteKit)
 *
 * @template Schema - The shape of your translation objects
 * @param config - I18n configuration (supports namespace config with ssrLoadedNamespaces)
 * @returns The i18n instance
 *
 * @example Basic usage
 * ```svelte
 * <!-- +layout.svelte -->
 * <script>
 *   import { setI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
 *
 *   type Schema = typeof import('./locales/en.json');
 *
 *   setI18n<Schema>({
 *     translations: { en, pl },
 *     initialLocale: 'en'
 *   });
 * </script>
 *
 * <slot />
 * ```
 *
 * @example With namespace SSR tracking
 * ```svelte
 * <script>
 *   import { setI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
 *   import { namespaceLoaders } from '$lib/i18n/config';
 *
 *   let { data } = $props();
 *
 *   setI18n({
 *     namespaceLoaders,
 *     initialLocale: data.locale,
 *     ssrLoadedTranslations: { [data.locale]: data.ssrTranslations },
 *     ssrLoadedNamespaces: { [data.locale]: data.loadedNamespaces }
 *   });
 * </script>
 * ```
 */
export function setI18n<Schema extends object>(config: I18nConfig<Schema> | I18nConfigWithNamespaces<Schema>) {
    const i18n = createI18n<Schema>(config);

    setContext(I18N_CONTEXT_KEY, i18n);

    return i18n;
}

/**
 * Retrieves the i18n instance from context
 * Use this in any component within the tree where setI18n was called
 *
 * @template Schema - The shape of your translation objects
 * @returns The i18n instance with reactive methods
 * @throws Error if called outside of a component tree with i18n context
 *
 * @example Correct usage - access locale through the object
 * ```svelte
 * <script>
 *   import { useI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
 *
 *   // ✅ CORRECT: Keep reference to i18n object
 *   const i18n = useI18n();
 *
 *   // ✅ Destructuring t, setLocale, fmt is safe (they are functions)
 *   const { t, setLocale, fmt } = i18n;
 * </script>
 *
 * <!-- ✅ Access locale through object for reactivity -->
 * <p>Current: {i18n.locale}</p>
 * <h1>{t('welcome.title')}</h1>
 * ```
 *
 * @example WRONG - destructuring locale breaks reactivity
 * ```svelte
 * <script>
 *   // ❌ WRONG: Destructuring locale captures primitive value, loses reactivity
 *   const { locale } = useI18n();  // locale is now 'en' forever!
 * </script>
 * ```
 */
export function useI18n<Schema extends object>(): I18nInstance<Schema> {
    const i18n = getContext<I18nInstance<Schema>>(I18N_CONTEXT_KEY);

    if (!i18n) {
        throw new Error('[i18n-svelte-runes-lite] useI18n() must be used within a component tree that has called setI18n()');
    }

    return i18n;
}

/**
 * Gets the current locale value from i18n context (ONE-TIME READ)
 *
 * @deprecated This function returns a static string value, NOT a reactive reference.
 * The returned value will NOT update when the locale changes.
 *
 * For reactive locale access, use `useI18n().locale` directly in your template:
 *
 * @template Schema - The shape of your translation objects
 * @returns The current locale string (static, non-reactive)
 *
 * @example WRONG - value never updates
 * ```svelte
 * <script>
 *   const locale = getLocale();  // ❌ Returns 'en', never changes
 * </script>
 * <p>{locale}</p>  <!-- Always shows initial value -->
 * ```
 *
 * @example CORRECT - use i18n object directly
 * ```svelte
 * <script>
 *   const i18n = useI18n();
 * </script>
 * <p>{i18n.locale}</p>  <!-- ✅ Updates when locale changes -->
 * ```
 */
export function getLocale<Schema extends object>(): string {
    const i18n = useI18n<Schema>();
    return i18n.locale;
}

/**
 * Returns a reactive locale getter function
 *
 * Unlike getLocale(), this returns a function that can be called to get
 * the current locale value reactively. Use this when you need to access
 * the locale in a reactive context outside of templates.
 *
 * @template Schema - The shape of your translation objects
 * @returns A getter function that returns the current locale
 *
 * @example Reactive usage
 * ```svelte
 * <script>
 *   import { getLocaleGetter } from '$lib/i18n-svelte-runes-lite/context.svelte';
 *   const locale = getLocaleGetter();
 *
 *   // ✅ Reactive - call the function where you need the value
 *   let message = $derived(`Current language: ${locale()}`);
 * </script>
 * <p>{locale()}</p>  <!-- ✅ Updates when locale changes -->
 * ```
 */
export function getLocaleGetter<Schema extends object>(): () => string {
    const i18n = useI18n<Schema>();
    return () => i18n.locale;
}

/**
 * Type-safe translation function from i18n context
 * Returns the t() function with full TypeScript autocomplete
 *
 * @template Schema - The shape of your translation objects
 * @returns The translation function
 *
 * @example Reactive usage in template
 * ```svelte
 * <script>
 *   import { getTranslator } from '$lib/i18n-svelte-runes-lite/context.svelte';
 *   const t = getTranslator();
 * </script>
 * <!-- ✅ Reactive in template -->
 * <p>{t('user.greeting', { name: 'John' })}</p>
 * ```
 *
 * @example Reactive usage in script (IMPORTANT)
 * ```svelte
 * <script>
 *   const t = getTranslator();
 *   // ✅ Use $derived for reactivity when locale changes
 *   let greeting = $derived(t('user.greeting', { name: 'John' }));
 *   // ❌ NOT reactive - won't update when locale changes
 *   const staticGreeting = t('user.greeting', { name: 'John' });
 * </script>
 * ```
 */
export function getTranslator<Schema extends object>() {
    const i18n = useI18n<Schema>();
    return i18n.t;
}

/**
 * Get the current locale for SSR lang attribute (ONE-TIME READ)
 *
 * NOTE: This returns a static string value. For SSR, you typically want to
 * determine the locale in hooks.server.ts from cookies/headers, not from
 * client-side context.
 *
 * @template Schema - The shape of your translation objects
 * @returns The current locale string
 *
 * @example Recommended SSR approach (in hooks.server.ts)
 * ```typescript
 * // src/hooks.server.ts
 * import type { Handle } from '@sveltejs/kit';
 *
 * export const handle: Handle = async ({ event, resolve }) => {
 *     // Get locale from cookie, URL param, or Accept-Language header
 *     const locale = event.cookies.get('locale') || 'en';
 *     event.locals.locale = locale;
 *
 *     return resolve(event, {
 *         transformPageChunk: ({ html }) => html.replace('%lang%', locale)
 *     });
 * };
 * ```
 *
 * Then in your `src/app.html`:
 * ```html
 * <!DOCTYPE html>
 * <html lang="%lang%">
 * ```
 */
export function getLangForSSR<Schema extends object>(): string {
    const i18n = useI18n<Schema>();
    return i18n.locale;
}
