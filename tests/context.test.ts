import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock Svelte's context functions before importing the module
const mockContextStore = new Map<symbol, unknown>();

vi.mock('svelte', () => ({
	setContext: vi.fn((key: symbol, value: unknown) => {
		mockContextStore.set(key, value);
	}),
	getContext: vi.fn((key: symbol) => {
		return mockContextStore.get(key);
	})
}));

// Import after mocking
import { setI18n, useI18n, getLocale, getLocaleGetter, getTranslator, getLangForSSR } from '../src/context.svelte';
import { setContext, getContext } from 'svelte';

// Mock translations - use 'as const' to preserve literal string types for type inference
const enTranslations = {
	greeting: 'Hello',
	welcome: 'Welcome, {{name}}!'
} as const;

const plTranslations = {
	greeting: 'Cześć',
	welcome: 'Witaj, {{name}}!'
} as const;

// Type alias for translations schema
type Schema = typeof enTranslations;

describe('context.svelte', () => {
	beforeEach(() => {
		mockContextStore.clear();
		vi.clearAllMocks();
	});

	describe('setI18n', () => {
		it('creates i18n instance and sets it in context', () => {
			const i18n = setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			expect(setContext).toHaveBeenCalledWith(
				expect.any(Symbol),
				expect.objectContaining({
					t: expect.any(Function),
					setLocale: expect.any(Function)
				})
			);

			expect(i18n.locale).toBe('en');
			expect(i18n.t('greeting')).toBe('Hello');
		});

		it('returns the created i18n instance', () => {
			const i18n = setI18n<Schema>({
				translations: { en: enTranslations, pl: plTranslations },
				initialLocale: 'en'
			});

			expect(i18n).toBeDefined();
			expect(i18n.t).toBeTypeOf('function');
			expect(i18n.setLocale).toBeTypeOf('function');
			expect(i18n.locale).toBe('en');
		});

		it('supports namespace configuration', () => {
			const i18n = setI18n<Schema>({
				translations: { en: enTranslations },
				namespaceLoaders: {
					en: {
						admin: () => Promise.resolve({ default: { panel: 'Admin' } })
					}
				},
				initialLocale: 'en'
			});

			expect(i18n.getAvailableNamespaces()).toContain('admin');
		});

		it('supports SSR loaded namespaces', () => {
			const i18n = setI18n<Schema>({
				translations: { en: enTranslations },
				namespaceLoaders: {
					en: {
						admin: () => Promise.resolve({ default: { panel: 'Admin' } })
					}
				},
				ssrLoadedNamespaces: { en: ['admin'] },
				initialLocale: 'en'
			});

			expect(i18n.isNamespaceLoaded('admin')).toBe(true);
		});
	});

	describe('useI18n', () => {
		it('retrieves i18n instance from context', () => {
			// First set up the context
			const originalI18n = setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			// Then retrieve it
			const retrievedI18n = useI18n();

			expect(getContext).toHaveBeenCalled();
			expect(retrievedI18n).toBe(originalI18n);
		});

		it('throws error when used outside context', () => {
			// Clear the context to simulate usage outside setI18n
			mockContextStore.clear();

			expect(() => useI18n()).toThrow(
				'useI18n() must be used within a component tree that has called setI18n()'
			);
		});

		it('returns fully typed i18n instance', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const i18n = useI18n<Schema>();

			expect(i18n.t('greeting')).toBe('Hello');
			expect(i18n.t('welcome', { name: 'World' })).toBe('Welcome, World!');
		});
	});

	describe('getLocale', () => {
		it('returns current locale string', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const locale = getLocale();
			expect(locale).toBe('en');
		});

		it('throws when used outside context', () => {
			mockContextStore.clear();

			expect(() => getLocale()).toThrow();
		});
	});

	describe('getLocaleGetter', () => {
		it('returns a function that returns current locale', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const localeGetter = getLocaleGetter();

			expect(typeof localeGetter).toBe('function');
			expect(localeGetter()).toBe('en');
		});

		it('throws when used outside context', () => {
			mockContextStore.clear();

			expect(() => getLocaleGetter()).toThrow();
		});
	});

	describe('getTranslator', () => {
		it('returns the t function', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const t = getTranslator<Schema>();

			expect(typeof t).toBe('function');
			expect(t('greeting')).toBe('Hello');
			expect(t('welcome', { name: 'Test' })).toBe('Welcome, Test!');
		});

		it('throws when used outside context', () => {
			mockContextStore.clear();

			expect(() => getTranslator()).toThrow();
		});
	});

	describe('getLangForSSR', () => {
		it('returns current locale string for SSR', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			const lang = getLangForSSR();
			expect(lang).toBe('en');
		});

		it('throws when used outside context', () => {
			mockContextStore.clear();

			expect(() => getLangForSSR()).toThrow();
		});
	});

	describe('context isolation', () => {
		it('uses Symbol for context key to prevent collisions', () => {
			setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			// The first argument to setContext should be a Symbol
			expect(setContext).toHaveBeenCalledWith(
				expect.any(Symbol),
				expect.anything()
			);
		});
	});

	describe('type safety', () => {
		it('works with typed schema', () => {
			type Schema = typeof enTranslations;

			const i18n = setI18n<Schema>({
				translations: { en: enTranslations },
				initialLocale: 'en'
			});

			// These should work without type errors
			expect(i18n.t('greeting')).toBe('Hello');
			expect(i18n.t('welcome', { name: 'World' })).toBe('Welcome, World!');
		});
	});
});
