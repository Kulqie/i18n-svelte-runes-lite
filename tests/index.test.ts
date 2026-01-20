import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from '../src/index.svelte';
import { createSharedConfig } from '../src/config';

// Mock translations - use 'as const' to preserve literal string types for type inference
const enTranslations = {
	greeting: 'Hello',
	welcome: 'Welcome, {{name}}!',
	nested: {
		key: 'Nested value',
		deep: {
			value: 'Deep nested'
		}
	},
	items: {
		one: '{{count}} item',
		other: '{{count}} items'
	},
	formatted: {
		price: 'Price: {{amount, currency, USD}}',
		number: 'Count: {{num, number}}'
	}
} as const;

const plTranslations = {
	greeting: 'Cześć',
	welcome: 'Witaj, {{name}}!',
	nested: {
		key: 'Zagnieżdżona wartość',
		deep: {
			value: 'Głęboko zagnieżdżona'
		}
	},
	items: {
		one: '{{count}} element',
		few: '{{count}} elementy',
		many: '{{count}} elementów',
		other: '{{count}} elementów'
	},
	formatted: {
		price: 'Cena: {{amount, currency, PLN}}',
		number: 'Liczba: {{num, number}}'
	}
} as const;

// Type alias for translations schema
type Schema = typeof enTranslations;

describe('createI18n', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// Reset document state
		if (typeof document !== 'undefined') {
			document.documentElement.lang = '';
		}
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		warnSpy.mockRestore();
	});

	describe('basic initialization', () => {
		it('creates i18n instance with translations', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.locale).toBe('en');
			expect(i18n.t('greeting')).toBe('Hello');
		});

		it('uses fallbackLocale when initialLocale not provided', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				fallbackLocale: 'en'
			});

			expect(i18n.locale).toBe('en');
		});

		it('returns supportedLocales array', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations, pl: plTranslations },
				initialLocale: 'en'
			});

			expect(i18n.supportedLocales).toContain('en');
			expect(i18n.supportedLocales).toContain('pl');
		});

		it('isLocaleSupported returns correct values', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations, pl: plTranslations },
				initialLocale: 'en'
			});

			expect(i18n.isLocaleSupported('en')).toBe(true);
			expect(i18n.isLocaleSupported('pl')).toBe(true);
			expect(i18n.isLocaleSupported('de')).toBe(false);
		});
	});

	describe('translation function (t)', () => {
		it('translates simple keys', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.t('greeting')).toBe('Hello');
		});

		it('translates nested keys with dot notation', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.t('nested.key')).toBe('Nested value');
			expect(i18n.t('nested.deep.value')).toBe('Deep nested');
		});

		it('interpolates parameters', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.t('welcome', { name: 'World' })).toBe('Welcome, World!');
		});

		it('handles pluralization for English', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.t('items', { count: 1 })).toBe('1 item');
			expect(i18n.t('items', { count: 5 })).toBe('5 items');
		});

		it('handles pluralization for Polish', () => {
			const i18n = createI18n<Schema>({
				translations: { pl: plTranslations, en: enTranslations },
				initialLocale: 'pl'
			});

			expect(i18n.t('items', { count: 1 })).toBe('1 element');
			expect(i18n.t('items', { count: 2 })).toBe('2 elementy');
			expect(i18n.t('items', { count: 5 })).toBe('5 elementów');
		});

		it('falls back to fallbackLocale when key missing', () => {
			const i18n = createI18n<Schema>({
				translations: {
					en: enTranslations,
					pl: { greeting: 'Cześć' } // Missing nested.key
				},
				initialLocale: 'pl',
				fallbackLocale: 'en'
			});

			expect(i18n.t('nested.key')).toBe('Nested value');
		});

		it('returns key when translation not found', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			// @ts-expect-error - testing invalid key behavior
			expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
		});

		it('calls onMissingKey callback when key missing in current locale but exists in fallback', async () => {
			const onMissingKey = vi.fn();
			const i18n = createI18n<Schema>({
				translations: {
					en: enTranslations,
					pl: { greeting: 'Cześć' } // Missing 'nested.key' which exists in 'en'
				},
				initialLocale: 'pl',
				fallbackLocale: 'en',
				onMissingKey
			});

			// 'nested.key' is missing in 'pl' but exists in 'en'
			i18n.t('nested.key');
			expect(onMissingKey).toHaveBeenCalledWith('nested.key', 'pl');
		});
	});

	describe('setLocale', () => {
		it('changes current locale', async () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations, pl: plTranslations },
				initialLocale: 'en'
			});

			await i18n.setLocale('pl');
			expect(i18n.locale).toBe('pl');
			expect(i18n.t('greeting')).toBe('Cześć');
		});

		it('warns when setting unsupported locale', async () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			await i18n.setLocale('de');
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Locale 'de' not found")
			);
			expect(i18n.locale).toBe('en'); // Should not change
		});
	});

	describe('lazy loading', () => {
		it('loads locale via loader', async () => {
			const loader = vi.fn().mockResolvedValue({ default: plTranslations });

			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				loaders: { pl: loader },
				initialLocale: 'en'
			});

			await i18n.setLocale('pl');

			expect(loader).toHaveBeenCalled();
			expect(i18n.locale).toBe('pl');
			expect(i18n.t('greeting')).toBe('Cześć');
		});

		it('loadLocale pre-loads without changing locale', async () => {
			const loader = vi.fn().mockResolvedValue({ default: plTranslations });

			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				loaders: { pl: loader },
				initialLocale: 'en'
			});

			await i18n.loadLocale('pl');

			expect(loader).toHaveBeenCalled();
			expect(i18n.locale).toBe('en'); // Should not change
			expect(i18n.isLocaleSupported('pl')).toBe(true);
		});

		it('handles loader failure gracefully', async () => {
			const loader = vi.fn().mockRejectedValue(new Error('Load failed'));

			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				loaders: { pl: loader },
				initialLocale: 'en'
			});

			await i18n.setLocale('pl');

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to load locale'),
				expect.any(Error)
			);
			expect(i18n.locale).toBe('en'); // Should not change on failure
		});

		it('does not call loader if translations already loaded', async () => {
			const loader = vi.fn().mockResolvedValue({ default: plTranslations });

			const i18n = createI18n<Schema>({
				translations: { en: enTranslations, pl: plTranslations },
				loaders: { pl: loader },
				initialLocale: 'en'
			});

			await i18n.setLocale('pl');

			expect(loader).not.toHaveBeenCalled();
		});

		it('handles raw object loaders (without default export)', async () => {
			const loader = vi.fn().mockResolvedValue(plTranslations);

			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				loaders: { pl: loader },
				initialLocale: 'en'
			});

			await i18n.setLocale('pl');
			expect(i18n.t('greeting')).toBe('Cześć');
		});
	});

	describe('debug mode', () => {
		it('returns keys instead of translations in debug mode', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			i18n.setDebug(true);
			expect(i18n.t('greeting')).toBe('[greeting]');
			expect(i18n.debug).toBe(true);
		});

		it('shows params in debug mode', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			i18n.setDebug(true);
			expect(i18n.t('welcome', { name: 'Test' })).toBe('[welcome] {name=Test}');
		});

		it('can disable debug mode', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			i18n.setDebug(true);
			i18n.setDebug(false);
			expect(i18n.t('greeting')).toBe('Hello');
			expect(i18n.debug).toBe(false);
		});
	});

	describe('formatters', () => {
		it('formats numbers', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const result = i18n.fmt.number(1234.56);
			expect(result).toContain('1');
			expect(result).toContain('234');
		});

		it('formats currency', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const result = i18n.fmt.currency(99.99);
			expect(result).toContain('99');
		});

		it('formats dates', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const result = i18n.fmt.date(new Date('2024-01-15'));
			expect(result).toContain('2024');
		});

		it('formats lists', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const result = i18n.fmt.list(['apple', 'banana', 'cherry']);
			expect(result).toContain('apple');
			expect(result).toContain('banana');
			expect(result).toContain('cherry');
		});
	});

	describe('shared config', () => {
		it('uses values from shared config', () => {
			const shared = createSharedConfig({
				fallbackLocale: 'pl',
				supportedLocales: ['en', 'pl']
			});

			const i18n = createI18n<Schema>({
				shared,
				translations: { en: enTranslations, pl: plTranslations }
			});

			expect(i18n.locale).toBe('pl');
		});

		it('explicit options override shared config', () => {
			const shared = createSharedConfig({
				fallbackLocale: 'pl'
			});

			const i18n = createI18n<Schema>({
				shared,
				translations: { en: enTranslations, pl: plTranslations },
				initialLocale: 'en'
			});

			expect(i18n.locale).toBe('en');
		});
	});

	describe('SSR-related methods', () => {
		it('getLangForSSR returns current locale', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.getLangForSSR()).toBe('en');
		});
	});

	describe('loading states', () => {
		it('isLoadingLocale is false initially', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.isLoadingLocale).toBe(false);
		});

		it('isLoadingNamespace is false initially', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.isLoadingNamespace).toBe(false);
		});

		it('isAnyLocaleLoading is false initially', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(i18n.isAnyLocaleLoading).toBe(false);
		});
	});

	describe('namespace support', () => {
		const commonTranslations = { title: 'Common Title' };
		const adminTranslations = { panel: 'Admin Panel' };

		it('loads namespace on demand', async () => {
			const namespaceLoader = vi.fn().mockResolvedValue({ default: adminTranslations });

			const i18n = createI18n<Schema>({
				translations: { en: commonTranslations },
				namespaceLoaders: {
					en: {
						admin: namespaceLoader
					}
				},
				initialLocale: 'en'
			});

			expect(i18n.isNamespaceLoaded('admin')).toBe(false);

			await i18n.loadNamespace('admin');

			expect(namespaceLoader).toHaveBeenCalled();
			expect(i18n.isNamespaceLoaded('admin')).toBe(true);
		});

		it('getAvailableNamespaces returns namespace list', () => {
			const i18n = createI18n<Schema>({
				translations: { en: commonTranslations },
				namespaceLoaders: {
					en: {
						admin: () => Promise.resolve({ default: adminTranslations }),
						dashboard: () => Promise.resolve({ default: {} })
					}
				},
				initialLocale: 'en'
			});

			const namespaces = i18n.getAvailableNamespaces();
			expect(namespaces).toContain('admin');
			expect(namespaces).toContain('dashboard');
		});

		it('addSsrLoadedNamespaces marks namespaces as loaded', () => {
			const i18n = createI18n<Schema>({
				translations: { en: commonTranslations },
				namespaceLoaders: {
					en: {
						admin: () => Promise.resolve({ default: adminTranslations })
					}
				},
				initialLocale: 'en'
			});

			i18n.addSsrLoadedNamespaces('en', ['admin']);
			expect(i18n.isNamespaceLoaded('admin')).toBe(true);
		});

		it('ssrLoadedNamespaces config marks namespaces as pre-loaded', () => {
			const i18n = createI18n<Schema>({
				translations: { en: commonTranslations },
				namespaceLoaders: {
					en: {
						admin: () => Promise.resolve({ default: adminTranslations })
					}
				},
				ssrLoadedNamespaces: { en: ['admin'] },
				initialLocale: 'en'
			});

			expect(i18n.isNamespaceLoaded('admin')).toBe(true);
		});
	});

	describe('race condition handling', () => {
		it('handles rapid locale changes correctly', async () => {
			let resolveEn: (value: any) => void;
			let resolvePl: (value: any) => void;

			const enLoader = vi.fn().mockImplementation(() =>
				new Promise(resolve => { resolveEn = resolve; })
			);
			const plLoader = vi.fn().mockImplementation(() =>
				new Promise(resolve => { resolvePl = resolve; })
			);

			const i18n = createI18n<Schema>({
				translations: {},
				loaders: {
					en: enLoader,
					pl: plLoader
				},
				initialLocale: 'en',
				fallbackLocale: 'en'
			});

			// Start loading en
			const enPromise = i18n.setLocale('en');
			// Immediately start loading pl (newer request)
			const plPromise = i18n.setLocale('pl');

			// Resolve pl first (newer request)
			resolvePl!({ default: plTranslations });
			await plPromise;

			// Then resolve en (stale request)
			resolveEn!({ default: enTranslations });
			await enPromise;

			// Should be 'pl' because that was the most recent request
			expect(i18n.locale).toBe('pl');
		});
	});

	describe('persistence strategies', () => {
		it('accepts strategy option', () => {
			// Should not throw
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en',
				strategy: 'localStorage'
			});
			expect(i18n).toBeDefined();
		});

		it('accepts bridge strategy', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en',
				strategy: 'bridge'
			});
			expect(i18n).toBeDefined();
		});

		it('accepts none strategy', () => {
			const i18n = createI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en',
				strategy: 'none'
			});
			expect(i18n).toBeDefined();
		});
	});
});
