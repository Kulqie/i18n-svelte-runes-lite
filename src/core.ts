import type { InterpolationParams } from './types';

// --- INTL FORMATTER CACHE ---
//
// PERFORMANCE FIX: Intl constructors are expensive. Creating a new Intl.NumberFormat
// or Intl.DateTimeFormat on every call causes significant performance issues when
// rendering lists (e.g., 100 items = 100 constructor calls).
//
// Solution: Cache formatters by locale + options. The cache key is a string
// representation of the locale and options object.
//

/** Cache for Intl.NumberFormat instances */
const numberFormatCache = new Map<string, Intl.NumberFormat>();

/** Cache for Intl.DateTimeFormat instances */
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

/** Cache for Intl.ListFormat instances */
const listFormatCache = new Map<string, Intl.ListFormat>();

/** Cache for Intl.PluralRules instances */
const pluralRulesCache = new Map<string, Intl.PluralRules>();

/** Maximum cache size to prevent memory leaks (per formatter type) */
const MAX_CACHE_SIZE = 50;

/**
 * Create a cache key from locale and options
 * Uses JSON.stringify with sorted keys to avoid collisions from special characters
 */
function makeCacheKey(locale: string, options?: object): string {
    if (!options || Object.keys(options).length === 0) {
        return locale;
    }
    // Sort keys for consistent cache hits regardless of property order
    const sortedKeys = Object.keys(options).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const k of sortedKeys) {
        sortedObj[k] = (options as Record<string, unknown>)[k];
    }
    return `${locale}|${JSON.stringify(sortedObj)}`;
}

/** Fallback locale used when Intl formatter creation fails */
const FALLBACK_LOCALE = 'en';

/**
 * Get or create a cached Intl.NumberFormat
 * Falls back to 'en' locale if the specified locale is invalid
 */
function getNumberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = makeCacheKey(locale, options);
    let formatter = numberFormatCache.get(key);
    if (!formatter) {
        // Evict oldest entry if cache is full
        if (numberFormatCache.size >= MAX_CACHE_SIZE) {
            const firstKey = numberFormatCache.keys().next().value;
            if (firstKey) numberFormatCache.delete(firstKey);
        }
        try {
            formatter = new Intl.NumberFormat(locale, options);
        } catch (e) {
            console.warn(`[i18n-svelte-runes-lite] Invalid locale '${locale}' for NumberFormat, falling back to '${FALLBACK_LOCALE}'.`);
            formatter = new Intl.NumberFormat(FALLBACK_LOCALE, options);
        }
        numberFormatCache.set(key, formatter);
    }
    return formatter;
}

/**
 * Get or create a cached Intl.DateTimeFormat
 * Falls back to 'en' locale if the specified locale is invalid
 */
function getDateTimeFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = makeCacheKey(locale, options);
    let formatter = dateTimeFormatCache.get(key);
    if (!formatter) {
        if (dateTimeFormatCache.size >= MAX_CACHE_SIZE) {
            const firstKey = dateTimeFormatCache.keys().next().value;
            if (firstKey) dateTimeFormatCache.delete(firstKey);
        }
        try {
            formatter = new Intl.DateTimeFormat(locale, options);
        } catch (e) {
            console.warn(`[i18n-svelte-runes-lite] Invalid locale '${locale}' for DateTimeFormat, falling back to '${FALLBACK_LOCALE}'.`);
            formatter = new Intl.DateTimeFormat(FALLBACK_LOCALE, options);
        }
        dateTimeFormatCache.set(key, formatter);
    }
    return formatter;
}

/**
 * Get or create a cached Intl.ListFormat
 * Falls back to 'en' locale if the specified locale is invalid
 */
function getListFormat(locale: string, options?: Intl.ListFormatOptions): Intl.ListFormat {
    const key = makeCacheKey(locale, options);
    let formatter = listFormatCache.get(key);
    if (!formatter) {
        if (listFormatCache.size >= MAX_CACHE_SIZE) {
            const firstKey = listFormatCache.keys().next().value;
            if (firstKey) listFormatCache.delete(firstKey);
        }
        try {
            formatter = new Intl.ListFormat(locale, options);
        } catch (e) {
            console.warn(`[i18n-svelte-runes-lite] Invalid locale '${locale}' for ListFormat, falling back to '${FALLBACK_LOCALE}'.`);
            formatter = new Intl.ListFormat(FALLBACK_LOCALE, options);
        }
        listFormatCache.set(key, formatter);
    }
    return formatter;
}

/**
 * Get or create a cached Intl.PluralRules
 * Falls back to 'en' locale if the specified locale is invalid
 */
function getPluralRules(locale: string): Intl.PluralRules {
    let rules = pluralRulesCache.get(locale);
    if (!rules) {
        if (pluralRulesCache.size >= MAX_CACHE_SIZE) {
            const firstKey = pluralRulesCache.keys().next().value;
            if (firstKey) pluralRulesCache.delete(firstKey);
        }
        try {
            rules = new Intl.PluralRules(locale);
        } catch (e) {
            console.warn(`[i18n-svelte-runes-lite] Invalid locale '${locale}' for PluralRules, falling back to '${FALLBACK_LOCALE}'.`);
            rules = new Intl.PluralRules(FALLBACK_LOCALE);
        }
        pluralRulesCache.set(locale, rules);
    }
    return rules;
}

/**
 * Escape HTML special characters to prevent XSS attacks
 * Used when interpolating user-provided values into translations
 * @param unsafe - Value to escape
 * @returns HTML-safe string
 */
export function escapeHtml(unsafe: unknown): string {
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Unsafe keys that could lead to prototype pollution attacks.
 * Block these to prevent malicious translation keys from accessing Object prototype.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safely access nested object properties via dot-notation
 * @example getNestedValue({ a: { b: 'hello' } }, 'a.b') // => 'hello'
 * @returns The value at the path, or undefined if not found. Callers should check the type.
 *
 * SECURITY: Blocks __proto__, constructor, and prototype keys to prevent
 * prototype pollution attacks via malicious translation keys.
 */
export function getNestedValue(obj: Record<string, unknown> | undefined | null, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (UNSAFE_KEYS.has(part)) return undefined;
    if (acc && typeof acc === 'object' && acc !== null) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/**
 * Determine the plural key suffix based on Intl.PluralRules
 * @param locale - BCP 47 language tag (e.g., 'en', 'pl')
 * @param count - Number to determine plural form for
 * @returns Plural form: 'one', 'two', 'few', 'many', or 'other'
 */
export function getPluralSuffix(locale: string, count: number): string {
    try {
        // Use cached PluralRules for performance
        const pr = getPluralRules(locale);
        return pr.select(count);
    } catch (e) {
        console.warn(`[i18n-svelte-runes-lite] Error getting plural suffix for locale '${locale}', count ${count}. Falling back to 'other'.`);
        return 'other';
    }
}

/**
 * Native Intl Formatters
 * Lightweight wrappers around browser built-in internationalization APIs
 *
 * PERFORMANCE: All formatters use cached Intl instances to avoid expensive
 * constructor calls on every format operation. This is critical for rendering
 * lists where the same formatter is used hundreds of times.
 */
export const formatters = {
    number: (num: number, locale: string, options?: Intl.NumberFormatOptions) =>
        getNumberFormat(locale, options).format(num),

    currency: (num: number, locale: string, currency = 'USD') =>
        getNumberFormat(locale, { style: 'currency', currency }).format(num),

    date: (date: Date | number | string, locale: string, options?: Intl.DateTimeFormatOptions) => {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            console.warn('[i18n-svelte-runes-lite] Invalid date value:', date);
            return String(date);
        }
        return getDateTimeFormat(locale, options).format(d);
    },

    list: (items: string[], locale: string, options?: Intl.ListFormatOptions) => {
        try {
            const mergedOptions = {
                style: 'long' as const,
                type: 'conjunction' as const,
                ...options
            };
            return getListFormat(locale, mergedOptions).format(items);
        } catch {
            return items.join(', ');
        }
    }
};

/**
 * Format a value based on format specifier in translation string
 * Supports: number, currency, date
 *
 * @param value - Value to format
 * @param format - Format type: 'number', 'currency', 'date'
 * @param formatArg - Optional argument (e.g., currency code)
 * @param locale - Current locale
 * @returns Formatted string
 */
export function formatValue(
    value: unknown,
    format: string,
    formatArg: string | undefined,
    locale: string
): string {
    switch (format) {
        case 'number':
            return formatters.number(Number(value), locale);

        case 'currency':
            return formatters.currency(Number(value), locale, formatArg || 'USD');

        case 'date':
            // Cast to accepted date types - formatters.date handles invalid values gracefully
            return formatters.date(value as Date | number | string, locale);

        default:
            return String(value);
    }
}

/**
 * Resolve plural key with fallback to 'other'
 * @param messages - Translation messages for a locale
 * @param baseKey - Base translation key (e.g., 'items')
 * @param locale - Locale for plural rules
 * @param count - Count for plural selection
 * @returns Translated text or undefined if not found
 */
function resolvePluralKey(
    messages: Record<string, unknown>,
    baseKey: string,
    locale: string,
    count: number
): string | undefined {
    const suffix = getPluralSuffix(locale, count);

    // Try exact plural form (e.g., items.few)
    let text = getNestedValue(messages, `${baseKey}.${suffix}`);
    if (typeof text === 'string') return text;

    // Fallback to 'other'
    text = getNestedValue(messages, `${baseKey}.other`);
    if (typeof text === 'string') return text;

    // Fallback to base key (for non-pluralized strings)
    text = getNestedValue(messages, baseKey);
    if (typeof text === 'string') return text;

    return undefined;
}

/**
 * Core translation logic
 * Completely decoupled from application state and data
 * @param locale - Current locale
 * @param fallbackLocale - Fallback locale when translation is missing
 * @param translations - Dictionary of all translation objects
 * @param key - Translation key (dot notation)
 * @param params - Optional interpolation parameters
 * @param onMissingKey - Optional callback when key is missing in current locale
 * @returns Translated string or the key if not found
 */
export function translateInternal(
    locale: string,
    fallbackLocale: string,
    translations: Record<string, Record<string, unknown>>,
    key: string,
    params?: InterpolationParams,
    onMissingKey?: (key: string, locale: string) => void
): string {
    const messages: Record<string, unknown> = translations[locale] || {};
    const defaultMessages: Record<string, unknown> = translations[fallbackLocale] || {};
    let text: string | undefined;

    // 1. Try current locale
    if (params && typeof params.count === 'number') {
        text = resolvePluralKey(messages, key, locale, params.count);
    } else {
        const val = getNestedValue(messages, key);
        text = typeof val === 'string' ? val : undefined;
    }

    // 2. Fallback to default locale with ITS OWN plural rules
    if (text === undefined && locale !== fallbackLocale) {
        // Call custom handler or default to console.warn
        if (onMissingKey) {
            onMissingKey(key, locale);
        } else {
            console.warn(`[i18n-svelte-runes-lite] Key '${key}' missing in '${locale}'. Fallback to '${fallbackLocale}'.`);
        }

        if (params && typeof params.count === 'number') {
            // CRITICAL: use fallbackLocale's plural rules, not the original locale!
            text = resolvePluralKey(defaultMessages, key, fallbackLocale, params.count);
        } else {
            const val = getNestedValue(defaultMessages, key);
            text = typeof val === 'string' ? val : undefined;
        }
    }

    // 3. Return key if nothing found
    if (text === undefined) {
        return key;
    }

    // 4. Interpolation {{param}} or {{param, format}} or {{param, format, arg}}
    // Regex to find all placeholders in text
    const placeholderRegex = /\{\{\s*([\w.-]+)(?:,\s*(\w+)(?:,\s*(\w+))?)?\s*\}\}/g;

    // Check for unfilled placeholders and warn
    const hasPlaceholders = placeholderRegex.test(text);
    placeholderRegex.lastIndex = 0; // Reset regex state after test()

    if (hasPlaceholders && !params) {
        // Translation has placeholders but no params were provided
        const matches = text.match(/\{\{\s*([\w.-]+)/g);
        const placeholderNames = matches?.map(m => m.replace(/\{\{\s*/, '')) || [];
        console.warn(
            `[i18n-svelte-runes-lite] Translation '${key}' has placeholders [${placeholderNames.join(', ')}] ` +
            `but no params were provided. Did you forget to pass them?`
        );
        return text;
    }

    if (params) {
        // Enhanced regex: matches {{var}}, {{ var }}, {{var, format}}, {{var, format, arg}}
        // Uses [\w.-]+ to support nested object paths like {{user.name}} and hyphenated keys like {{user-name}}
        // Allows optional whitespace after {{ and before }} for flexibility (e.g., "Hello {{ name }}")
        return text.replace(
            placeholderRegex,
            (_, varPath, format, formatArg) => {
                // Use getNestedValue to support dot-notation paths
                const val = getNestedValue(params, varPath);
                if (val === undefined) {
                    console.warn(
                        `[i18n-svelte-runes-lite] Missing param '${varPath}' for translation '${key}'. ` +
                        `Provided params: [${Object.keys(params).join(', ')}]`
                    );
                    return `{{${varPath}}}`;
                }
                // If format specified, use formatValue (formatters return safe strings)
                if (format) {
                    return formatValue(val, format, formatArg, locale);
                }
                // Auto-format Date objects to prevent timezone leakage in SSR
                // Uses locale-aware formatting instead of raw Date.toString()
                if (val instanceof Date) {
                    return formatters.date(val, locale);
                }
                // Return raw value - Svelte's {...} interpolation handles escaping
                // For {@html} usage, the caller (TransRich) handles escaping explicitly
                return String(val);
            }
        );
    }

    return text;
}
