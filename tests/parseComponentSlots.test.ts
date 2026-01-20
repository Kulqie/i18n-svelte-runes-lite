import { describe, it, expect, vi } from 'vitest';
import { parseComponentSlots, hasComponentSlots } from '../src/parseComponentSlots';

describe('parseComponentSlots', () => {
	describe('basic parsing', () => {
		it('returns text node for plain string', () => {
			const result = parseComponentSlots('Hello world');
			expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
		});

		it('parses single component tag', () => {
			const result = parseComponentSlots('Click <Link>here</Link>');
			expect(result).toEqual([
				{ type: 'text', content: 'Click ' },
				{ type: 'slot', name: 'link', slotContent: 'here' }
			]);
		});

		it('parses multiple component tags', () => {
			const result = parseComponentSlots('Accept <Link>terms</Link> and <Button>privacy</Button>');
			expect(result).toEqual([
				{ type: 'text', content: 'Accept ' },
				{ type: 'slot', name: 'link', slotContent: 'terms' },
				{ type: 'text', content: ' and ' },
				{ type: 'slot', name: 'button', slotContent: 'privacy' }
			]);
		});

		it('handles tag at start', () => {
			const result = parseComponentSlots('<Bold>Start</Bold> of text');
			expect(result).toEqual([
				{ type: 'slot', name: 'bold', slotContent: 'Start' },
				{ type: 'text', content: ' of text' }
			]);
		});

		it('handles tag at end', () => {
			const result = parseComponentSlots('End of <Emphasis>text</Emphasis>');
			expect(result).toEqual([
				{ type: 'text', content: 'End of ' },
				{ type: 'slot', name: 'emphasis', slotContent: 'text' }
			]);
		});

		it('lowercases tag names', () => {
			const result = parseComponentSlots('<MyComponent>content</MyComponent>');
			expect(result[0].name).toBe('mycomponent');
		});

		it('handles kebab-case component names', () => {
			const result = parseComponentSlots('<my-button>click</my-button>');
			expect(result).toEqual([{ type: 'slot', name: 'my-button', slotContent: 'click' }]);
		});
	});

	describe('attribute parsing', () => {
		it('parses attributes with double quotes', () => {
			const result = parseComponentSlots('<Link href="/home">home</Link>');
			expect(result[0].attributes).toEqual({ href: '/home' });
		});

		it('parses attributes with single quotes', () => {
			const result = parseComponentSlots("<Link href='/home'>home</Link>");
			expect(result[0].attributes).toEqual({ href: '/home' });
		});

		it('parses multiple attributes', () => {
			const result = parseComponentSlots('<Link href="/home" class="nav" id="link1">home</Link>');
			expect(result[0].attributes).toEqual({
				href: '/home',
				class: 'nav',
				id: 'link1'
			});
		});

		it('parses unquoted attributes', () => {
			const result = parseComponentSlots('<Link href=/home>home</Link>');
			expect(result[0].attributes).toEqual({ href: '/home' });
		});

		it('parses boolean attributes', () => {
			const result = parseComponentSlots('<Button disabled>click</Button>');
			expect(result[0].attributes).toEqual({ disabled: '' });
		});
	});

	describe('XSS protection', () => {
		it('blocks onclick event handlers', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const result = parseComponentSlots('<Link onclick="alert(1)" href="/safe">click</Link>');
			expect(result[0].attributes).toEqual({ href: '/safe' });
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Blocked dangerous attribute')
			);
			consoleSpy.mockRestore();
		});

		it('blocks onmouseover event handlers', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const result = parseComponentSlots('<Link onmouseover="alert(1)">hover</Link>');
			expect(result[0].attributes).toBeUndefined();
			consoleSpy.mockRestore();
		});

		it('blocks all on* event handlers', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const events = ['onclick', 'onload', 'onerror', 'onfocus', 'onblur'];
			for (const event of events) {
				const result = parseComponentSlots(`<Link ${event}="alert(1)">test</Link>`);
				expect(result[0].attributes).toBeUndefined();
			}
			consoleSpy.mockRestore();
		});

		it('blocks javascript: URLs in href', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const result = parseComponentSlots('<Link href="javascript:alert(1)">click</Link>');
			expect(result[0].attributes).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked unsafe URL'));
			consoleSpy.mockRestore();
		});

		it('blocks data: URLs in href', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const result = parseComponentSlots('<Link href="data:text/plain,hello">click</Link>');
			expect(result[0].attributes).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked unsafe URL'));
			consoleSpy.mockRestore();
		});

		it('blocks vbscript: URLs', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const result = parseComponentSlots('<Link href="vbscript:msgbox(1)">click</Link>');
			expect(result[0].attributes).toBeUndefined();
			consoleSpy.mockRestore();
		});

		it('allows https: URLs', () => {
			const result = parseComponentSlots('<Link href="https://example.com">click</Link>');
			expect(result[0].attributes).toEqual({ href: 'https://example.com' });
		});

		it('allows http: URLs', () => {
			const result = parseComponentSlots('<Link href="http://example.com">click</Link>');
			expect(result[0].attributes).toEqual({ href: 'http://example.com' });
		});

		it('allows mailto: URLs', () => {
			const result = parseComponentSlots('<Link href="mailto:test@example.com">email</Link>');
			expect(result[0].attributes).toEqual({ href: 'mailto:test@example.com' });
		});

		it('allows tel: URLs', () => {
			const result = parseComponentSlots('<Link href="tel:+1234567890">call</Link>');
			expect(result[0].attributes).toEqual({ href: 'tel:+1234567890' });
		});

		it('allows relative URLs', () => {
			const result = parseComponentSlots('<Link href="/path/to/page">page</Link>');
			expect(result[0].attributes).toEqual({ href: '/path/to/page' });
		});

		it('allows anchor links', () => {
			const result = parseComponentSlots('<Link href="#section">jump</Link>');
			expect(result[0].attributes).toEqual({ href: '#section' });
		});

		it('blocks javascript: with control characters', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			// Using \x00 to try to bypass
			const result = parseComponentSlots('<Link href="java\x00script:alert(1)">click</Link>');
			expect(result[0].attributes).toBeUndefined();
			consoleSpy.mockRestore();
		});
	});

	describe('edge cases', () => {
		it('handles empty string', () => {
			const result = parseComponentSlots('');
			expect(result).toEqual([]);
		});

		it('handles unclosed tags (no match)', () => {
			const result = parseComponentSlots('<Link>unclosed');
			// Should return as text since no closing tag
			expect(result).toEqual([{ type: 'text', content: '<Link>unclosed' }]);
		});

		it('handles tags without content', () => {
			const result = parseComponentSlots('<Link></Link>');
			expect(result).toEqual([{ type: 'slot', name: 'link', slotContent: '' }]);
		});

		it('handles case-insensitive closing tags', () => {
			const result = parseComponentSlots('<Link>text</LINK>');
			expect(result).toEqual([{ type: 'slot', name: 'link', slotContent: 'text' }]);
		});
	});

	describe('ReDoS protection', () => {
		it('returns text node for strings exceeding max length', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const longString = 'a'.repeat(10001);
			const result = parseComponentSlots(longString);
			expect(result).toEqual([{ type: 'text', content: longString }]);
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds'));
			consoleSpy.mockRestore();
		});
	});

	describe('caching', () => {
		it('returns same result for same input (cached)', () => {
			const input = 'Cached <Link>test</Link>';
			const result1 = parseComponentSlots(input);
			const result2 = parseComponentSlots(input);
			expect(result1).toBe(result2); // Same reference = cached
		});
	});
});

describe('hasComponentSlots', () => {
	it('returns true for strings with component tags', () => {
		expect(hasComponentSlots('Click <Link>here</Link>')).toBe(true);
		expect(hasComponentSlots('<Button>text</Button>')).toBe(true);
	});

	it('returns false for plain strings', () => {
		expect(hasComponentSlots('Hello world')).toBe(false);
		expect(hasComponentSlots('')).toBe(false);
	});

	it('returns false for unclosed tags', () => {
		expect(hasComponentSlots('<Link>unclosed')).toBe(false);
	});

	it('returns false for HTML-like but invalid patterns', () => {
		expect(hasComponentSlots('a < b > c')).toBe(false);
		expect(hasComponentSlots('1<2')).toBe(false);
	});

	it('returns false for long strings (safety limit)', () => {
		const longString = '<Link>' + 'a'.repeat(10000) + '</Link>';
		expect(hasComponentSlots(longString)).toBe(false);
	});
});
