import { describe, it, expect, vi } from 'vitest';
import {
	escapeHtml,
	getNestedValue,
	getPluralSuffix,
	formatters,
	formatValue,
	translateInternal
} from '../src/core';
import { createWarnSpy } from './helpers';

describe('escapeHtml', () => {
	it('escapes HTML special characters', () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe(
			'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
		);
	});

	it('escapes ampersands', () => {
		expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
	});

	it('escapes single quotes', () => {
		expect(escapeHtml("it's")).toBe('it&#039;s');
	});

	it('handles non-string values', () => {
		expect(escapeHtml(123)).toBe('123');
		expect(escapeHtml(null)).toBe('null');
		expect(escapeHtml(undefined)).toBe('undefined');
	});

	it('returns empty string for empty input', () => {
		expect(escapeHtml('')).toBe('');
	});
});

describe('getNestedValue', () => {
	const testObj = {
		level1: {
			level2: {
				level3: 'deep value'
			},
			value: 'level2 value'
		},
		simple: 'simple value'
	};

	it('retrieves simple keys', () => {
		expect(getNestedValue(testObj, 'simple')).toBe('simple value');
	});

	it('retrieves nested keys with dot notation', () => {
		expect(getNestedValue(testObj, 'level1.value')).toBe('level2 value');
		expect(getNestedValue(testObj, 'level1.level2.level3')).toBe('deep value');
	});

	it('returns undefined for missing keys', () => {
		expect(getNestedValue(testObj, 'nonexistent')).toBeUndefined();
		expect(getNestedValue(testObj, 'level1.nonexistent')).toBeUndefined();
	});

	it('handles null/undefined objects', () => {
		// Returns falsy values (null/undefined) which indicates "not found"
		expect(getNestedValue(null, 'key')).toBeFalsy();
		expect(getNestedValue(undefined, 'key')).toBeFalsy();
	});

	// Security: Prototype pollution protection
	it('blocks __proto__ key (prototype pollution)', () => {
		expect(getNestedValue(testObj, '__proto__')).toBeUndefined();
		expect(getNestedValue(testObj, 'level1.__proto__')).toBeUndefined();
	});

	it('blocks constructor key (prototype pollution)', () => {
		expect(getNestedValue(testObj, 'constructor')).toBeUndefined();
	});

	it('blocks prototype key (prototype pollution)', () => {
		expect(getNestedValue(testObj, 'prototype')).toBeUndefined();
	});
});

describe('getPluralSuffix', () => {
	it('returns correct English plural forms', () => {
		expect(getPluralSuffix('en', 0)).toBe('other');
		expect(getPluralSuffix('en', 1)).toBe('one');
		expect(getPluralSuffix('en', 2)).toBe('other');
		expect(getPluralSuffix('en', 100)).toBe('other');
	});

	it('returns correct Polish plural forms', () => {
		// Polish has complex plural rules: one, few, many, other
		expect(getPluralSuffix('pl', 1)).toBe('one');
		expect(getPluralSuffix('pl', 2)).toBe('few');
		expect(getPluralSuffix('pl', 3)).toBe('few');
		expect(getPluralSuffix('pl', 4)).toBe('few');
		expect(getPluralSuffix('pl', 5)).toBe('many');
		expect(getPluralSuffix('pl', 22)).toBe('few');
	});

	it('returns correct Arabic plural forms', () => {
		// Arabic has: zero, one, two, few, many, other
		expect(getPluralSuffix('ar', 0)).toBe('zero');
		expect(getPluralSuffix('ar', 1)).toBe('one');
		expect(getPluralSuffix('ar', 2)).toBe('two');
	});

	it('falls back to English plural rules for invalid locales', () => {
		// Invalid locale gracefully falls back to 'en' with a warning
		// So count=1 returns 'one' (English rule) instead of 'other'
		const consoleSpy = createWarnSpy();
		expect(getPluralSuffix('invalid-locale-xyz', 1)).toBe('one');
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("Invalid locale 'invalid-locale-xyz'")
		);
		consoleSpy.mockRestore();
	});
});

describe('formatters', () => {
	describe('number', () => {
		it('formats numbers with locale', () => {
			expect(formatters.number(1234.56, 'en-US')).toBe('1,234.56');
			expect(formatters.number(1234.56, 'de-DE')).toBe('1.234,56');
		});

		it('respects format options', () => {
			expect(formatters.number(0.1234, 'en-US', { style: 'percent' })).toBe('12%');
		});
	});

	describe('currency', () => {
		it('formats currency with default USD', () => {
			const result = formatters.currency(99.99, 'en-US');
			expect(result).toContain('99.99');
			expect(result).toMatch(/\$|USD/);
		});

		it('formats currency with specified code', () => {
			const result = formatters.currency(99.99, 'de-DE', 'EUR');
			expect(result).toContain('99,99');
		});
	});

	describe('date', () => {
		it('formats Date objects', () => {
			const date = new Date('2024-01-15T12:00:00Z');
			const result = formatters.date(date, 'en-US');
			expect(result).toContain('2024');
		});

		it('formats timestamps', () => {
			const timestamp = new Date('2024-01-15').getTime();
			const result = formatters.date(timestamp, 'en-US');
			expect(result).toContain('2024');
		});

		it('handles invalid dates gracefully', () => {
			const consoleSpy = createWarnSpy();
			const result = formatters.date('not a date', 'en-US');
			expect(result).toBe('not a date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('list', () => {
		it('formats lists with conjunction', () => {
			expect(formatters.list(['apple', 'banana', 'cherry'], 'en-US')).toBe(
				'apple, banana, and cherry'
			);
		});

		it('formats lists with disjunction', () => {
			expect(
				formatters.list(['apple', 'banana'], 'en-US', { type: 'disjunction' })
			).toBe('apple or banana');
		});

		it('handles single item', () => {
			expect(formatters.list(['apple'], 'en-US')).toBe('apple');
		});

		it('handles empty list', () => {
			expect(formatters.list([], 'en-US')).toBe('');
		});
	});
});

describe('formatValue', () => {
	it('formats numbers', () => {
		expect(formatValue(1234, 'number', undefined, 'en-US')).toBe('1,234');
	});

	it('formats currency with default USD', () => {
		const result = formatValue(99, 'currency', undefined, 'en-US');
		expect(result).toContain('99');
	});

	it('formats currency with specified code', () => {
		const result = formatValue(99, 'currency', 'EUR', 'de-DE');
		expect(result).toContain('99');
	});

	it('formats dates', () => {
		const result = formatValue(new Date('2024-01-15'), 'date', undefined, 'en-US');
		expect(result).toContain('2024');
	});

	it('returns string for unknown format', () => {
		expect(formatValue('test', 'unknown', undefined, 'en-US')).toBe('test');
	});
});

describe('translateInternal', () => {
	const translations = {
		en: {
			greeting: 'Hello',
			welcome: 'Welcome, {{name}}!',
			nested: {
				key: 'Nested value'
			},
			items: {
				one: '{{count}} item',
				other: '{{count}} items'
			},
			formatted: {
				price: 'Price: {{amount, currency}}',
				date: 'Date: {{date, date}}',
				number: 'Count: {{num, number}}'
			},
			user: {
				profile: 'User: {{user.name}}'
			}
		},
		pl: {
			greeting: 'Witaj',
			items: {
				one: '{{count}} element',
				few: '{{count}} elementy',
				many: '{{count}} elementow',
				other: '{{count}} elementow'
			}
		}
	};

	it('returns simple translation', () => {
		expect(translateInternal('en', 'en', translations, 'greeting')).toBe('Hello');
	});

	it('returns nested translation', () => {
		expect(translateInternal('en', 'en', translations, 'nested.key')).toBe('Nested value');
	});

	it('interpolates parameters', () => {
		expect(translateInternal('en', 'en', translations, 'welcome', { name: 'World' })).toBe(
			'Welcome, World!'
		);
	});

	it('handles nested params with dot notation', () => {
		expect(
			translateInternal('en', 'en', translations, 'user.profile', { user: { name: 'John' } } as any)
		).toBe('User: John');
	});

	it('returns key for missing translation', () => {
		expect(translateInternal('en', 'en', translations, 'nonexistent')).toBe('nonexistent');
	});

	it('falls back to fallback locale', () => {
		const consoleSpy = createWarnSpy();
		expect(translateInternal('pl', 'en', translations, 'nested.key')).toBe('Nested value');
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('calls onMissingKey callback when key missing in current locale', () => {
		const onMissingKey = vi.fn();
		translateInternal('pl', 'en', translations, 'nested.key', undefined, onMissingKey);
		expect(onMissingKey).toHaveBeenCalledWith('nested.key', 'pl');
	});

	describe('pluralization', () => {
		it('selects correct English plural form', () => {
			expect(translateInternal('en', 'en', translations, 'items', { count: 1 })).toBe('1 item');
			expect(translateInternal('en', 'en', translations, 'items', { count: 0 })).toBe('0 items');
			expect(translateInternal('en', 'en', translations, 'items', { count: 5 })).toBe('5 items');
		});

		it('selects correct Polish plural forms', () => {
			expect(translateInternal('pl', 'en', translations, 'items', { count: 1 })).toBe('1 element');
			expect(translateInternal('pl', 'en', translations, 'items', { count: 2 })).toBe('2 elementy');
			expect(translateInternal('pl', 'en', translations, 'items', { count: 5 })).toBe(
				'5 elementow'
			);
			expect(translateInternal('pl', 'en', translations, 'items', { count: 22 })).toBe(
				'22 elementy'
			);
		});
	});

	describe('formatting in translations', () => {
		it('formats currency inline', () => {
			const result = translateInternal('en', 'en', translations, 'formatted.price', {
				amount: 99.99
			});
			expect(result).toContain('99.99');
		});

		it('formats numbers inline', () => {
			const result = translateInternal('en', 'en', translations, 'formatted.number', {
				num: 1000
			});
			expect(result).toContain('1,000');
		});

		it('formats dates inline', () => {
			const result = translateInternal('en', 'en', translations, 'formatted.date', {
				date: new Date('2024-01-15')
			});
			expect(result).toContain('2024');
		});
	});

	describe('whitespace handling', () => {
		it('handles whitespace in interpolation', () => {
			const trans = {
				en: {
					spaced: 'Hello {{ name }}!'
				}
			};
			expect(translateInternal('en', 'en', trans, 'spaced', { name: 'World' })).toBe(
				'Hello World!'
			);
		});
	});

	it('preserves placeholder when param missing', () => {
		const consoleSpy = createWarnSpy();
		expect(translateInternal('en', 'en', translations, 'welcome', {})).toBe('Welcome, {{name}}!');
		consoleSpy.mockRestore();
	});

	describe('missing params warnings', () => {
		it('warns when translation has placeholders but no params provided', () => {
			const consoleSpy = createWarnSpy();

			translateInternal('en', 'en', translations, 'welcome');

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Translation 'welcome' has placeholders [name]")
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('but no params were provided')
			);
			consoleSpy.mockRestore();
		});

		it('warns when a specific param is missing', () => {
			const consoleSpy = createWarnSpy();

			translateInternal('en', 'en', translations, 'welcome', { wrongParam: 'value' });

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Missing param 'name' for translation 'welcome'")
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Provided params: [wrongParam]')
			);
			consoleSpy.mockRestore();
		});

		it('does not warn when all params provided correctly', () => {
			const consoleSpy = createWarnSpy();

			translateInternal('en', 'en', translations, 'welcome', { name: 'World' });

			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it('does not warn for translations without placeholders', () => {
			const consoleSpy = createWarnSpy();

			translateInternal('en', 'en', translations, 'greeting');

			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});
});
