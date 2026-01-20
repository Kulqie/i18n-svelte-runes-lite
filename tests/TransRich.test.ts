import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TransRich from '../src/TransRich.svelte';

// Mock translation function
function createMockT(translations: Record<string, string>) {
	return vi.fn((key: string, params?: Record<string, string | number | Date>) => {
		let result = translations[key] || key;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				result = result.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v));
			}
		}
		return result;
	});
}

describe('TransRich.svelte', () => {
	describe('basic rendering', () => {
		it('renders plain text translation', () => {
			const t = createMockT({ greeting: 'Hello World' });

			render(TransRich, {
				props: { key: 'greeting', t }
			});

			expect(screen.getByText('Hello World')).toBeTruthy();
		});

		it('calls t function with correct key', () => {
			const t = createMockT({ greeting: 'Hello' });

			render(TransRich, {
				props: { key: 'greeting', t }
			});

			expect(t).toHaveBeenCalledWith('greeting', undefined);
		});
	});

	describe('safe HTML tags (auto-rendered)', () => {
		it('renders <b> tags', () => {
			const t = createMockT({ text: 'This is <b>bold</b> text' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b')).toBeTruthy();
			expect(container.querySelector('b')?.textContent).toBe('bold');
		});

		it('renders <strong> tags', () => {
			const t = createMockT({ text: 'This is <strong>important</strong>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('strong')).toBeTruthy();
		});

		it('renders <em> tags', () => {
			const t = createMockT({ text: 'This is <em>emphasized</em>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('em')).toBeTruthy();
		});

		it('renders <i> tags', () => {
			const t = createMockT({ text: 'This is <i>italic</i>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('i')).toBeTruthy();
		});

		it('renders <u> tags', () => {
			const t = createMockT({ text: 'This is <u>underlined</u>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('u')).toBeTruthy();
		});

		it('renders <s> tags', () => {
			const t = createMockT({ text: 'This is <s>strikethrough</s>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('s')).toBeTruthy();
		});

		it('renders <mark> tags', () => {
			const t = createMockT({ text: 'This is <mark>highlighted</mark>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('mark')).toBeTruthy();
		});

		it('renders <small> tags', () => {
			const t = createMockT({ text: 'This is <small>small</small>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('small')).toBeTruthy();
		});

		it('renders <sub> tags', () => {
			const t = createMockT({ text: 'H<sub>2</sub>O' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('sub')).toBeTruthy();
		});

		it('renders <sup> tags', () => {
			const t = createMockT({ text: 'E=mc<sup>2</sup>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('sup')).toBeTruthy();
		});

		it('renders <span> tags', () => {
			const t = createMockT({ text: 'This is <span>wrapped</span>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			// Note: the wrapper is also a span, so we look for nested content
			expect(container.textContent).toContain('wrapped');
		});

		it('renders multiple safe tags', () => {
			const t = createMockT({ text: 'This is <b>bold</b> and <em>emphasized</em>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b')).toBeTruthy();
			expect(container.querySelector('em')).toBeTruthy();
		});
	});

	describe('safe attributes on auto-rendered tags', () => {
		it('renders class attribute on safe tags', () => {
			const t = createMockT({ text: '<b class="highlight">text</b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b.highlight')).toBeTruthy();
		});

		it('renders title attribute on safe tags', () => {
			const t = createMockT({ text: '<b title="tooltip">text</b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b[title="tooltip"]')).toBeTruthy();
		});

		it('filters out style attribute (security)', () => {
			const t = createMockT({ text: '<b style="color:red">text</b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			const b = container.querySelector('b');
			expect(b).toBeTruthy();
			expect(b?.getAttribute('style')).toBeNull();
		});
	});

	describe('non-safe tags fallback', () => {
		it('renders content as text for unknown tags without snippet', () => {
			const t = createMockT({ text: 'Click <link>here</link> to continue' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			// Without a snippet, content should be rendered as text
			expect(container.textContent).toContain('here');
			expect(container.querySelector('link')).toBeFalsy();
		});
	});

	describe('interpolation', () => {
		it('passes params to t function', () => {
			const t = createMockT({ message: 'Hello {{name}}!' });

			render(TransRich, {
				props: {
					key: 'message',
					t,
					params: { name: 'World' }
				}
			});

			expect(t).toHaveBeenCalledWith('message', { name: 'World' });
			expect(screen.getByText('Hello World!')).toBeTruthy();
		});

		it('passes spread props as params (non-function)', () => {
			const t = createMockT({ count: 'Items: {{n}}' });

			render(TransRich, {
				props: { key: 'count', t, n: 42 }
			});

			expect(screen.getByText('Items: 42')).toBeTruthy();
		});
	});

	describe('wrapper element', () => {
		it('renders as span by default', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			// The outer element should be span
			expect(container.firstElementChild?.tagName.toLowerCase()).toBe('span');
		});

		it('renders as custom element via "as" prop', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: { key: 'text', t, as: 'div' }
			});

			expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div');
		});
	});

	describe('HTML attributes on wrapper', () => {
		it('forwards class attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: { key: 'text', t, class: 'my-class' }
			});

			expect(container.querySelector('.my-class')).toBeTruthy();
		});

		it('forwards style attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: { key: 'text', t, style: 'color: blue' }
			});

			const style = container.firstElementChild?.getAttribute('style');
			expect(style).toContain('color');
			expect(style).toContain('blue');
		});

		it('forwards id attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: { key: 'text', t, id: 'my-id' }
			});

			expect(container.querySelector('#my-id')).toBeTruthy();
		});

		it('forwards ARIA attributes', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(TransRich, {
				props: {
					key: 'text',
					t,
					role: 'heading',
					'aria-label': 'Label'
				}
			});

			expect(container.querySelector('[role="heading"]')).toBeTruthy();
			expect(container.querySelector('[aria-label="Label"]')).toBeTruthy();
		});
	});

	describe('XSS protection', () => {
		it('escapes HTML in content', () => {
			const t = createMockT({ xss: '<script>alert(1)</script>' });

			const { container } = render(TransRich, {
				props: { key: 'xss', t }
			});

			expect(container.querySelector('script')).toBeFalsy();
		});

		it('escapes HTML in safe tag content', () => {
			const t = createMockT({ text: '<b><script>evil</script></b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('script')).toBeFalsy();
			const b = container.querySelector('b');
			expect(b?.textContent).toContain('<script>');
		});

		it('escapes attribute values in safe tags', () => {
			const t = createMockT({ text: '<b class="test\"><script>evil</script><b class=\"">text</b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('script')).toBeFalsy();
		});
	});

	describe('utility function protection', () => {
		it('does not treat utility function props as snippets', () => {
			const t = createMockT({ text: 'Click <format>here</format>' });

			const { container } = render(TransRich, {
				props: {
					key: 'text',
					t,
					format: (x: string) => x.toUpperCase() // utility function
				}
			});

			// Should render content as text since format is blocked
			expect(container.textContent).toContain('here');
		});

		it('blocks common utility function names', () => {
			const t = createMockT({ text: '<validate>content</validate>' });
			const utilityFn = vi.fn();

			const { container } = render(TransRich, {
				props: {
					key: 'text',
					t,
					validate: utilityFn
				}
			});

			// Should not call the utility function as a snippet
			expect(utilityFn).not.toHaveBeenCalled();
			expect(container.textContent).toContain('content');
		});
	});

	describe('event handler protection', () => {
		it('does not treat onclick as snippet', () => {
			const t = createMockT({ text: 'Content' });
			const clickHandler = vi.fn();

			const { container } = render(TransRich, {
				props: {
					key: 'text',
					t,
					onclick: clickHandler
				}
			});

			// onclick should not be treated as a snippet
			expect(container.textContent).toBe('Content');
		});
	});

	describe('reserved attribute filtering', () => {
		it('does not pass class as interpolation param', () => {
			const t = createMockT({ text: 'Class: {{class}}' });

			render(TransRich, {
				props: { key: 'text', t, class: 'my-class' }
			});

			// class should NOT be passed as interpolation param
			expect(t).toHaveBeenCalledWith('text', undefined);
		});

		it('does not pass data-* as interpolation param', () => {
			const t = createMockT({ text: 'Content' });

			render(TransRich, {
				props: { key: 'text', t, 'data-testid': 'test' }
			});

			expect(t).toHaveBeenCalledWith('text', undefined);
		});
	});

	describe('empty and edge cases', () => {
		it('handles empty translation', () => {
			const t = createMockT({ empty: '' });

			const { container } = render(TransRich, {
				props: { key: 'empty', t }
			});

			expect(container.firstElementChild).toBeTruthy();
		});

		it('handles missing translation key', () => {
			const t = createMockT({});

			render(TransRich, {
				props: { key: 'missing', t }
			});

			// Should show the key
			expect(screen.getByText('missing')).toBeTruthy();
		});

		it('handles empty tag content', () => {
			const t = createMockT({ text: '<b></b>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b')).toBeTruthy();
			expect(container.querySelector('b')?.textContent).toBe('');
		});

		it('handles multiple adjacent tags', () => {
			const t = createMockT({ text: '<b>one</b><em>two</em><strong>three</strong>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b')?.textContent).toBe('one');
			expect(container.querySelector('em')?.textContent).toBe('two');
			expect(container.querySelector('strong')?.textContent).toBe('three');
		});
	});

	describe('case insensitivity', () => {
		it('handles uppercase closing tags', () => {
			const t = createMockT({ text: '<b>text</B>' });

			const { container } = render(TransRich, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('b')?.textContent).toBe('text');
		});
	});
});
