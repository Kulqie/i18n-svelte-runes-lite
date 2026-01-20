import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Trans from '../src/Trans.svelte';

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

describe('Trans.svelte', () => {
	describe('basic rendering', () => {
		it('renders simple translation', () => {
			const t = createMockT({ greeting: 'Hello' });

			render(Trans, {
				props: { key: 'greeting', t }
			});

			expect(screen.getByText('Hello')).toBeTruthy();
		});

		it('calls t function with correct key', () => {
			const t = createMockT({ greeting: 'Hello' });

			render(Trans, {
				props: { key: 'greeting', t }
			});

			expect(t).toHaveBeenCalledWith('greeting', undefined);
		});

		it('renders nested keys', () => {
			const t = createMockT({ 'nested.key': 'Nested Value' });

			render(Trans, {
				props: { key: 'nested.key', t }
			});

			expect(screen.getByText('Nested Value')).toBeTruthy();
		});
	});

	describe('interpolation', () => {
		it('passes params object to t function', () => {
			const t = createMockT({ welcome: 'Hello, {{name}}!' });

			render(Trans, {
				props: {
					key: 'welcome',
					t,
					params: { name: 'World' }
				}
			});

			expect(t).toHaveBeenCalledWith('welcome', { name: 'World' });
			expect(screen.getByText('Hello, World!')).toBeTruthy();
		});

		it('passes spread props as params', () => {
			const t = createMockT({ message: 'Count: {{count}}' });

			render(Trans, {
				props: {
					key: 'message',
					t,
					count: 42
				}
			});

			expect(screen.getByText('Count: 42')).toBeTruthy();
		});

		it('combines explicit params with spread props', () => {
			const t = createMockT({ message: '{{a}} and {{b}}' });

			render(Trans, {
				props: {
					key: 'message',
					t,
					params: { a: 'First' },
					b: 'Second'
				}
			});

			expect(screen.getByText('First and Second')).toBeTruthy();
		});
	});

	describe('wrapper element', () => {
		it('renders as span by default', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t }
			});

			expect(container.querySelector('span')).toBeTruthy();
		});

		it('renders as custom element via "as" prop', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, as: 'p' }
			});

			expect(container.querySelector('p')).toBeTruthy();
			expect(container.querySelector('span')).toBeFalsy();
		});

		it('renders as div when specified', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, as: 'div' }
			});

			expect(container.querySelector('div')).toBeTruthy();
		});
	});

	describe('HTML attributes', () => {
		it('forwards class attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, class: 'my-class' }
			});

			expect(container.querySelector('.my-class')).toBeTruthy();
		});

		it('forwards style attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, style: 'color: red' }
			});

			const element = container.querySelector('span');
			expect(element?.getAttribute('style')).toContain('color');
			expect(element?.getAttribute('style')).toContain('red');
		});

		it('forwards id attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, id: 'my-id' }
			});

			expect(container.querySelector('#my-id')).toBeTruthy();
		});

		it('forwards title attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, title: 'My Title' }
			});

			expect(container.querySelector('[title="My Title"]')).toBeTruthy();
		});

		it('forwards lang attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, lang: 'en' }
			});

			expect(container.querySelector('[lang="en"]')).toBeTruthy();
		});

		it('forwards dir attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, dir: 'rtl' }
			});

			expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
		});
	});

	describe('ARIA attributes', () => {
		it('forwards role attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, role: 'heading' }
			});

			expect(container.querySelector('[role="heading"]')).toBeTruthy();
		});

		it('forwards aria-label attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, 'aria-label': 'Accessible label' }
			});

			expect(container.querySelector('[aria-label="Accessible label"]')).toBeTruthy();
		});

		it('forwards aria-hidden attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, 'aria-hidden': 'true' }
			});

			expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
		});

		it('forwards aria-describedby attribute', () => {
			const t = createMockT({ text: 'Content' });

			const { container } = render(Trans, {
				props: { key: 'text', t, 'aria-describedby': 'desc-id' }
			});

			expect(container.querySelector('[aria-describedby="desc-id"]')).toBeTruthy();
		});
	});

	describe('reserved attribute filtering', () => {
		it('does not pass class as interpolation param', () => {
			const t = createMockT({ text: '{{class}}' });

			render(Trans, {
				props: { key: 'text', t, class: 'my-class' }
			});

			// class should be on the element, not interpolated
			expect(t).toHaveBeenCalledWith('text', undefined);
		});

		it('does not pass style as interpolation param', () => {
			const t = createMockT({ text: '{{style}}' });

			render(Trans, {
				props: { key: 'text', t, style: 'color: red' }
			});

			expect(t).toHaveBeenCalledWith('text', undefined);
		});

		it('does not pass data-* attributes as interpolation params', () => {
			const t = createMockT({ text: 'Content' });

			render(Trans, {
				props: { key: 'text', t, 'data-testid': 'test' }
			});

			// data-* attributes should not be passed to t()
			expect(t).toHaveBeenCalledWith('text', undefined);
		});
	});

	describe('XSS protection', () => {
		it('escapes HTML in translations (via Svelte)', () => {
			const t = createMockT({ xss: '<script>alert("xss")</script>' });

			const { container } = render(Trans, {
				props: { key: 'xss', t }
			});

			// Should not execute script, content should be escaped
			expect(container.querySelector('script')).toBeFalsy();
			expect(container.textContent).toContain('<script>');
		});

		it('escapes HTML in interpolation params', () => {
			const t = createMockT({ message: 'Hello {{name}}!' });

			const { container } = render(Trans, {
				props: {
					key: 'message',
					t,
					name: '<img src=x onerror=alert(1)>'
				}
			});

			expect(container.querySelector('img')).toBeFalsy();
		});
	});

	describe('type coercion', () => {
		it('handles number params', () => {
			const t = createMockT({ count: 'Items: {{n}}' });

			render(Trans, {
				props: { key: 'count', t, n: 42 }
			});

			expect(screen.getByText('Items: 42')).toBeTruthy();
		});

		it('handles Date params', () => {
			const date = new Date('2024-01-15');
			const t = vi.fn((key, params) => {
				if (params?.date instanceof Date) {
					return `Date: ${params.date.toISOString()}`;
				}
				return key;
			});

			render(Trans, {
				props: { key: 'date', t, date }
			});

			expect(t).toHaveBeenCalledWith('date', { date: expect.any(Date) });
		});

		it('ignores function params (not string/number/Date)', () => {
			const t = createMockT({ text: 'Content' });

			render(Trans, {
				props: {
					key: 'text',
					t,
					callback: () => {} // Should be ignored
				}
			});

			// callback should not be passed as param
			expect(t).toHaveBeenCalledWith('text', undefined);
		});
	});
});
