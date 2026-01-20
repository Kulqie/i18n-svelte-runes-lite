import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	createSharedConfig,
	validateStorageKey,
	VALID_STORAGE_KEY_PATTERN,
	MAX_STORAGE_KEY_LENGTH
} from '../src/config';
import { createWarnSpy, type SpyInstance } from './helpers';

describe('createSharedConfig', () => {
	let consoleSpy: SpyInstance;

	beforeEach(() => {
		consoleSpy = createWarnSpy();
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	describe('defaults', () => {
		it('returns default config when called with empty object', () => {
			const config = createSharedConfig({});
			expect(config.fallbackLocale).toBe('en');
			expect(config.storageKey).toBe('locale');
			expect(config.endpoint).toBe('/__i18n/save');
			expect(config.warnOnAutoFix).toBe(true);
		});

		it('returns default config when called with no arguments', () => {
			const config = createSharedConfig();
			expect(config.fallbackLocale).toBe('en');
			expect(config.storageKey).toBe('locale');
			expect(config.endpoint).toBe('/__i18n/save');
		});
	});

	describe('fallbackLocale validation', () => {
		it('accepts valid fallbackLocale', () => {
			const config = createSharedConfig({ fallbackLocale: 'pl' });
			expect(config.fallbackLocale).toBe('pl');
		});

		it('trims whitespace from fallbackLocale', () => {
			const config = createSharedConfig({ fallbackLocale: '  en  ' });
			expect(config.fallbackLocale).toBe('en');
		});

		it('throws for non-string fallbackLocale', () => {
			expect(() => createSharedConfig({ fallbackLocale: 123 as any })).toThrow(
				'fallbackLocale must be a string'
			);
		});

		it('throws for empty fallbackLocale', () => {
			expect(() => createSharedConfig({ fallbackLocale: '' })).toThrow(
				'fallbackLocale must be a non-empty string'
			);
		});

		it('throws for whitespace-only fallbackLocale', () => {
			expect(() => createSharedConfig({ fallbackLocale: '   ' })).toThrow(
				'fallbackLocale must be a non-empty string'
			);
		});
	});

	describe('storageKey validation', () => {
		it('accepts valid storageKey', () => {
			const config = createSharedConfig({ storageKey: 'app-locale' });
			expect(config.storageKey).toBe('app-locale');
		});

		it('accepts storageKey with underscores', () => {
			const config = createSharedConfig({ storageKey: 'app_locale' });
			expect(config.storageKey).toBe('app_locale');
		});

		it('trims whitespace from storageKey', () => {
			const config = createSharedConfig({ storageKey: '  locale  ' });
			expect(config.storageKey).toBe('locale');
		});

		it('throws for non-string storageKey', () => {
			expect(() => createSharedConfig({ storageKey: 123 as any })).toThrow(
				'storageKey must be a string'
			);
		});

		it('throws for empty storageKey', () => {
			expect(() => createSharedConfig({ storageKey: '' })).toThrow(
				'storageKey must be a non-empty string'
			);
		});

		it('throws for storageKey starting with hyphen', () => {
			expect(() => createSharedConfig({ storageKey: '-locale' })).toThrow(
				'storageKey \'-locale\' is invalid'
			);
		});

		it('throws for storageKey with invalid characters', () => {
			expect(() => createSharedConfig({ storageKey: 'locale;evil' })).toThrow(
				'is invalid'
			);
		});

		it('throws for storageKey with equals sign', () => {
			expect(() => createSharedConfig({ storageKey: 'locale=value' })).toThrow(
				'is invalid'
			);
		});

		it('throws for storageKey exceeding max length', () => {
			const longKey = 'a'.repeat(MAX_STORAGE_KEY_LENGTH + 1);
			expect(() => createSharedConfig({ storageKey: longKey })).toThrow(
				'exceeds maximum length'
			);
		});

		it('warns about dots in storageKey', () => {
			createSharedConfig({ storageKey: 'app.locale' });
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('contains dots')
			);
		});

		it('does not warn about dots when warnOnAutoFix is false', () => {
			createSharedConfig({ storageKey: 'app.locale', warnOnAutoFix: false });
			expect(consoleSpy).not.toHaveBeenCalled();
		});
	});

	describe('endpoint validation', () => {
		it('accepts valid endpoint', () => {
			const config = createSharedConfig({ endpoint: '/api/i18n/save' });
			expect(config.endpoint).toBe('/api/i18n/save');
		});

		it('trims whitespace from endpoint', () => {
			const config = createSharedConfig({ endpoint: '  /__i18n/save  ' });
			expect(config.endpoint).toBe('/__i18n/save');
		});

		it('removes trailing slashes from endpoint', () => {
			const config = createSharedConfig({ endpoint: '/__i18n/save/' });
			expect(config.endpoint).toBe('/__i18n/save');
		});

		it('removes multiple trailing slashes', () => {
			const config = createSharedConfig({ endpoint: '/__i18n/save///' });
			expect(config.endpoint).toBe('/__i18n/save');
		});

		it('preserves root slash endpoint', () => {
			const config = createSharedConfig({ endpoint: '/' });
			expect(config.endpoint).toBe('/');
		});

		it('throws for non-string endpoint', () => {
			expect(() => createSharedConfig({ endpoint: 123 as any })).toThrow(
				'endpoint must be a string'
			);
		});

		it('throws for endpoint not starting with slash', () => {
			expect(() => createSharedConfig({ endpoint: 'api/i18n/save' })).toThrow(
				'endpoint must start with \'/\''
			);
		});
	});

	describe('supportedLocales validation', () => {
		it('accepts valid supportedLocales array', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: ['en', 'pl', 'de']
			});
			expect(config.supportedLocales).toEqual(['en', 'pl', 'de']);
		});

		it('throws for non-array supportedLocales', () => {
			expect(() =>
				createSharedConfig({ supportedLocales: 'en' as any })
			).toThrow('supportedLocales must be an array');
		});

		it('throws for empty supportedLocales array', () => {
			expect(() => createSharedConfig({ supportedLocales: [] })).toThrow(
				'supportedLocales cannot be an empty array'
			);
		});

		it('throws for non-string items in supportedLocales', () => {
			expect(() =>
				createSharedConfig({ supportedLocales: ['en', 123 as any] })
			).toThrow('supportedLocales[1] must be a string');
		});

		it('throws for empty string in supportedLocales', () => {
			expect(() =>
				createSharedConfig({ supportedLocales: ['en', ''] })
			).toThrow('supportedLocales[1] is empty or whitespace-only');
		});

		it('trims whitespace from supportedLocales', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: ['  en  ', ' pl ']
			});
			expect(config.supportedLocales).toEqual(['en', 'pl']);
		});

		it('removes duplicate locales (case-insensitive)', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: ['en', 'EN', 'pl', 'PL']
			});
			expect(config.supportedLocales).toEqual(['en', 'pl']);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('duplicate locales detected')
			);
		});

		it('auto-adds fallbackLocale to supportedLocales if missing', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: ['pl', 'de']
			});
			expect(config.supportedLocales).toContain('en');
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('was not in supportedLocales')
			);
		});

		it('normalizes locale casing to match fallbackLocale', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en-US',
				supportedLocales: ['en-us', 'pl']
			});
			expect(config.supportedLocales).toContain('en-US');
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('normalized locale casing')
			);
		});
	});

	describe('cookie attributes validation', () => {
		it('accepts valid cookieMaxAge', () => {
			const config = createSharedConfig({ cookieMaxAge: 86400 });
			expect(config.cookieMaxAge).toBe(86400);
		});

		it('throws for non-number cookieMaxAge', () => {
			expect(() => createSharedConfig({ cookieMaxAge: '86400' as any })).toThrow(
				'cookieMaxAge must be a number'
			);
		});

		it('throws for negative cookieMaxAge', () => {
			expect(() => createSharedConfig({ cookieMaxAge: -1 })).toThrow(
				'cookieMaxAge must be a non-negative finite number'
			);
		});

		it('throws for infinite cookieMaxAge', () => {
			expect(() => createSharedConfig({ cookieMaxAge: Infinity })).toThrow(
				'cookieMaxAge must be a non-negative finite number'
			);
		});

		it('accepts valid cookiePath', () => {
			const config = createSharedConfig({ cookiePath: '/app' });
			expect(config.cookiePath).toBe('/app');
		});

		it('throws for non-string cookiePath', () => {
			expect(() => createSharedConfig({ cookiePath: 123 as any })).toThrow(
				'cookiePath must be a string'
			);
		});

		it('normalizes empty cookiePath to undefined', () => {
			const config = createSharedConfig({ cookiePath: '' });
			expect(config.cookiePath).toBeUndefined();
		});

		it('accepts valid cookieSameSite values', () => {
			expect(createSharedConfig({ cookieSameSite: 'strict' }).cookieSameSite).toBe('strict');
			expect(createSharedConfig({ cookieSameSite: 'lax' }).cookieSameSite).toBe('lax');
			expect(
				createSharedConfig({ cookieSameSite: 'none', cookieSecure: true }).cookieSameSite
			).toBe('none');
		});

		it('throws for invalid cookieSameSite', () => {
			expect(() =>
				createSharedConfig({ cookieSameSite: 'invalid' as any })
			).toThrow('cookieSameSite must be one of');
		});

		it('throws for cookieSameSite=none without cookieSecure=true', () => {
			expect(() => createSharedConfig({ cookieSameSite: 'none' })).toThrow(
				'cookieSameSite=\'none\' requires explicit cookieSecure=true'
			);
		});

		it('throws for cookieSameSite=none with cookieSecure=false', () => {
			expect(() =>
				createSharedConfig({ cookieSameSite: 'none', cookieSecure: false })
			).toThrow('cookieSameSite=\'none\' requires explicit cookieSecure=true');
		});

		it('accepts cookieSameSite=none with cookieSecure=true', () => {
			const config = createSharedConfig({ cookieSameSite: 'none', cookieSecure: true });
			expect(config.cookieSameSite).toBe('none');
			expect(config.cookieSecure).toBe(true);
		});

		it('throws for non-boolean cookieSecure', () => {
			expect(() => createSharedConfig({ cookieSecure: 'true' as any })).toThrow(
				'cookieSecure must be a boolean'
			);
		});
	});

	describe('warnOnAutoFix option', () => {
		it('defaults to true', () => {
			const config = createSharedConfig({});
			expect(config.warnOnAutoFix).toBe(true);
		});

		it('can be set to false', () => {
			const config = createSharedConfig({ warnOnAutoFix: false });
			expect(config.warnOnAutoFix).toBe(false);
		});

		it('throws for non-boolean warnOnAutoFix', () => {
			expect(() => createSharedConfig({ warnOnAutoFix: 'false' as any })).toThrow(
				'warnOnAutoFix must be a boolean'
			);
		});
	});

	describe('immutability', () => {
		it('returns frozen config object', () => {
			const config = createSharedConfig({});
			expect(Object.isFrozen(config)).toBe(true);
		});

		it('returns frozen supportedLocales array', () => {
			const config = createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: ['en', 'pl']
			});
			expect(Object.isFrozen(config.supportedLocales)).toBe(true);
		});

		it('does not mutate input array', () => {
			const locales = ['en', 'pl'];
			createSharedConfig({
				fallbackLocale: 'en',
				supportedLocales: locales
			});
			expect(locales).toEqual(['en', 'pl']);
		});
	});
});

describe('validateStorageKey', () => {
	it('accepts valid storage keys', () => {
		expect(() => validateStorageKey('locale', 'test')).not.toThrow();
		expect(() => validateStorageKey('app-locale', 'test')).not.toThrow();
		expect(() => validateStorageKey('app_locale', 'test')).not.toThrow();
		expect(() => validateStorageKey('locale123', 'test')).not.toThrow();
	});

	it('throws for non-string keys', () => {
		expect(() => validateStorageKey(123 as any, 'test')).toThrow(
			'storageKey must be a string'
		);
	});

	it('throws for empty keys', () => {
		expect(() => validateStorageKey('', 'test')).toThrow(
			'storageKey must be a non-empty string'
		);
	});

	it('throws for whitespace-only keys', () => {
		expect(() => validateStorageKey('   ', 'test')).toThrow(
			'storageKey must be a non-empty string'
		);
	});

	it('throws for keys with invalid characters', () => {
		expect(() => validateStorageKey('locale;', 'test')).toThrow('is invalid');
		expect(() => validateStorageKey('locale=', 'test')).toThrow('is invalid');
		// Note: 'locale ' is valid after trimming - the function trims input
		// Test with space in the middle instead
		expect(() => validateStorageKey('locale key', 'test')).toThrow('is invalid');
	});

	it('throws for keys starting with non-alphanumeric', () => {
		expect(() => validateStorageKey('-locale', 'test')).toThrow('is invalid');
		expect(() => validateStorageKey('.locale', 'test')).toThrow('is invalid');
		expect(() => validateStorageKey('_locale', 'test')).toThrow('is invalid');
	});

	it('throws for keys exceeding max length', () => {
		const longKey = 'a'.repeat(MAX_STORAGE_KEY_LENGTH + 1);
		expect(() => validateStorageKey(longKey, 'test')).toThrow('exceeds maximum length');
	});

	it('includes context in error messages', () => {
		expect(() => validateStorageKey('', 'myContext')).toThrow('[i18n-svelte-runes-lite] myContext:');
	});
});

describe('VALID_STORAGE_KEY_PATTERN', () => {
	it('matches valid keys', () => {
		expect(VALID_STORAGE_KEY_PATTERN.test('locale')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('app-locale')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('app_locale')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('app.locale')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('locale123')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('a')).toBe(true);
		expect(VALID_STORAGE_KEY_PATTERN.test('A')).toBe(true);
	});

	it('rejects invalid keys', () => {
		expect(VALID_STORAGE_KEY_PATTERN.test('-locale')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('.locale')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('_locale')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('locale;')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('locale=')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('locale ')).toBe(false);
		expect(VALID_STORAGE_KEY_PATTERN.test('')).toBe(false);
	});
});

describe('MAX_STORAGE_KEY_LENGTH', () => {
	it('is set to 64', () => {
		expect(MAX_STORAGE_KEY_LENGTH).toBe(64);
	});
});
