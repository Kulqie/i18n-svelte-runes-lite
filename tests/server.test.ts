import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createI18nHook, getLocaleFromLocals } from '../src/server';
import { createSharedConfig } from '../src/config';
import { createErrorSpy, type SpyInstance } from './helpers';

// Mock SvelteKit types
interface MockCookies {
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
}

interface MockHeaders {
	get: ReturnType<typeof vi.fn>;
}

interface MockRequest {
	method: string;
	json: ReturnType<typeof vi.fn>;
	headers: MockHeaders;
}

interface MockEvent {
	url: URL;
	request: MockRequest;
	cookies: MockCookies;
	locals: Record<string, unknown>;
}

function createMockEvent(overrides: Partial<{
	pathname: string;
	method: string;
	cookieValue: string | undefined;
	jsonBody: unknown;
	protocol: string;
	acceptLanguage: string | null;
}>): MockEvent {
	const {
		pathname = '/',
		method = 'GET',
		cookieValue = undefined,
		jsonBody = {},
		protocol = 'https:',
		acceptLanguage = null
	} = overrides;

	return {
		url: new URL(`${protocol}//localhost${pathname}`),
		request: {
			method,
			json: vi.fn().mockResolvedValue(jsonBody),
			headers: {
				get: vi.fn().mockImplementation((name: string) => {
					if (name.toLowerCase() === 'accept-language') {
						return acceptLanguage;
					}
					return null;
				})
			}
		},
		cookies: {
			get: vi.fn().mockReturnValue(cookieValue),
			set: vi.fn()
		},
		locals: {}
	};
}

function createMockResolve(html: string = '<!DOCTYPE html><html><head></head><body></body></html>') {
	return vi.fn().mockImplementation(async (_event, options) => {
		let result = html;
		if (options?.transformPageChunk) {
			result = options.transformPageChunk({ html, done: true });
		}
		return new Response(result);
	});
}

describe('createI18nHook', () => {
	let consoleSpy: SpyInstance;

	beforeEach(() => {
		consoleSpy = createErrorSpy();
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	describe('configuration', () => {
		it('uses default values when no options provided', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('locale');
			expect(event.locals.locale).toBe('en');
		});

		it('uses custom fallbackLocale', async () => {
			const hook = createI18nHook({ fallbackLocale: 'de' });
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('de');
		});

		it('uses custom storageKey', async () => {
			const hook = createI18nHook({ storageKey: 'app-locale' });
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('app-locale');
		});

		it('uses deprecated cookieName if storageKey not provided', async () => {
			const hook = createI18nHook({ cookieName: 'old-locale' });
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('old-locale');
		});

		it('prefers storageKey over cookieName', async () => {
			const hook = createI18nHook({ storageKey: 'new-locale', cookieName: 'old-locale' });
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('new-locale');
		});

		it('uses shared config values', async () => {
			const shared = createSharedConfig({
				fallbackLocale: 'pl',
				storageKey: 'shared-locale',
				supportedLocales: ['en', 'pl']
			});
			const hook = createI18nHook({ shared });
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('shared-locale');
			expect(event.locals.locale).toBe('pl');
		});

		it('explicit options override shared config', async () => {
			const shared = createSharedConfig({
				fallbackLocale: 'pl',
				storageKey: 'shared-locale'
			});
			const hook = createI18nHook({
				shared,
				fallbackLocale: 'de',
				storageKey: 'explicit-locale'
			});
			const event = createMockEvent({});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.cookies.get).toHaveBeenCalledWith('explicit-locale');
			expect(event.locals.locale).toBe('de');
		});

		it('throws for invalid storageKey', () => {
			expect(() => createI18nHook({ storageKey: ';invalid' })).toThrow();
		});
	});

	describe('locale reading from cookie', () => {
		it('reads locale from cookie', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({ cookieValue: 'pl' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('pl');
		});

		it('falls back to default for missing cookie', async () => {
			const hook = createI18nHook({ fallbackLocale: 'en' });
			const event = createMockEvent({ cookieValue: undefined });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en');
		});

		it('falls back for unsupported locale', async () => {
			const hook = createI18nHook({
				fallbackLocale: 'en',
				supportedLocales: ['en', 'pl']
			});
			const event = createMockEvent({ cookieValue: 'fr' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en');
		});

		it('handles case-insensitive locale matching', async () => {
			const hook = createI18nHook({ supportedLocales: ['en-US', 'pl'] });
			const event = createMockEvent({ cookieValue: 'en-us' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en-US');
		});
	});

	describe('Accept-Language header detection', () => {
		it('uses Accept-Language when no cookie is set', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl', 'de'] });
			const event = createMockEvent({ acceptLanguage: 'pl,en;q=0.9' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('pl');
		});

		it('respects quality values in Accept-Language', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl', 'de'] });
			const event = createMockEvent({ acceptLanguage: 'fr;q=0.9,de;q=0.8,en;q=0.7' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			// fr is not supported, so should pick de (next highest q)
			expect(event.locals.locale).toBe('de');
		});

		it('matches base language from regional variant', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({ acceptLanguage: 'pl-PL,en-US;q=0.9' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('pl');
		});

		it('matches regional variant from base language', async () => {
			const hook = createI18nHook({ supportedLocales: ['en-US', 'pl-PL'] });
			const event = createMockEvent({ acceptLanguage: 'pl,en;q=0.9' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('pl-PL');
		});

		it('cookie takes priority over Accept-Language', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl', 'de'] });
			const event = createMockEvent({ cookieValue: 'de', acceptLanguage: 'pl,en;q=0.9' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('de');
		});

		it('falls back to default when Accept-Language has no matches', async () => {
			const hook = createI18nHook({ fallbackLocale: 'en', supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({ acceptLanguage: 'fr,es;q=0.9' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en');
		});

		it('falls back to default when no Accept-Language header', async () => {
			const hook = createI18nHook({ fallbackLocale: 'en' });
			const event = createMockEvent({ acceptLanguage: null });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en');
		});
	});

	describe('locale matching (cookie)', () => {
		it('matches base language to regional variant', async () => {
			const hook = createI18nHook({ supportedLocales: ['en-US', 'pl'] });
			const event = createMockEvent({ cookieValue: 'en' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en-US');
		});

		it('matches regional variant to base language', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({ cookieValue: 'en-US' });
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(event.locals.locale).toBe('en');
		});
	});

	describe('locale save endpoint', () => {
		it('handles POST to default endpoint', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST',
				jsonBody: { locale: 'pl' }
			});

			const response = await hook({ event: event as any, resolve: vi.fn() });
			const body = await response.json();

			expect(body.success).toBe(true);
			expect(body.locale).toBe('pl');
			expect(event.cookies.set).toHaveBeenCalledWith(
				'locale',
				'pl',
				expect.objectContaining({
					path: '/',
					httpOnly: true
				})
			);
		});

		it('handles POST to custom endpoint', async () => {
			const hook = createI18nHook({
				endpoint: '/api/i18n/save',
				supportedLocales: ['en', 'pl']
			});
			const event = createMockEvent({
				pathname: '/api/i18n/save',
				method: 'POST',
				jsonBody: { locale: 'pl' }
			});

			const response = await hook({ event: event as any, resolve: vi.fn() });
			const body = await response.json();

			expect(body.success).toBe(true);
		});

		it('handles endpoint with trailing slash', async () => {
			const hook = createI18nHook({ supportedLocales: ['en', 'pl'] });
			const event = createMockEvent({
				pathname: '/__i18n/save/',
				method: 'POST',
				jsonBody: { locale: 'pl' }
			});

			const response = await hook({ event: event as any, resolve: vi.fn() });
			const body = await response.json();

			expect(body.success).toBe(true);
		});

		it('validates locale against supportedLocales', async () => {
			const hook = createI18nHook({
				fallbackLocale: 'en',
				supportedLocales: ['en', 'pl']
			});
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST',
				jsonBody: { locale: 'invalid' }
			});

			const response = await hook({ event: event as any, resolve: vi.fn() });
			const body = await response.json();

			expect(body.success).toBe(true);
			expect(body.locale).toBe('en'); // Falls back to default
		});

		it('returns 400 for invalid JSON', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST'
			});
			event.request.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

			const response = await hook({ event: event as any, resolve: vi.fn() });

			expect(response.status).toBe(400);
		});

		it('does not intercept GET requests to endpoint', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'GET'
			});
			const resolve = createMockResolve();

			await hook({ event: event as any, resolve });

			expect(resolve).toHaveBeenCalled();
		});

		it('sets cookie with custom attributes', async () => {
			const hook = createI18nHook({
				cookieMaxAge: 86400,
				cookiePath: '/app',
				cookieSameSite: 'strict',
				cookieSecure: true
			});
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST',
				jsonBody: { locale: 'en' }
			});

			await hook({ event: event as any, resolve: vi.fn() });

			expect(event.cookies.set).toHaveBeenCalledWith(
				'locale',
				'en',
				expect.objectContaining({
					path: '/app',
					maxAge: 86400,
					sameSite: 'strict',
					secure: true,
					httpOnly: true
				})
			);
		});

		it('auto-detects secure based on HTTPS', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST',
				jsonBody: { locale: 'en' },
				protocol: 'https:'
			});

			await hook({ event: event as any, resolve: vi.fn() });

			expect(event.cookies.set).toHaveBeenCalledWith(
				'locale',
				'en',
				expect.objectContaining({
					secure: true
				})
			);
		});

		it('auto-detects insecure based on HTTP', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({
				pathname: '/__i18n/save',
				method: 'POST',
				jsonBody: { locale: 'en' },
				protocol: 'http:'
			});

			await hook({ event: event as any, resolve: vi.fn() });

			expect(event.cookies.set).toHaveBeenCalledWith(
				'locale',
				'en',
				expect.objectContaining({
					secure: false
				})
			);
		});
	});

	describe('HTML transformation', () => {
		it('replaces %lang% placeholder', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({ cookieValue: 'pl' });
			const resolve = vi.fn().mockImplementation(async (_e, options) => {
				const html = options.transformPageChunk({
					html: '<!DOCTYPE html><html lang="%lang%"><body></body></html>',
					done: true
				});
				return new Response(html);
			});

			const response = await hook({ event: event as any, resolve });
			const html = await response.text();

			expect(html).toContain('lang="pl"');
			expect(html).not.toContain('%lang%');
		});

		it('updates existing lang attribute with double quotes', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({ cookieValue: 'de' });
			const resolve = vi.fn().mockImplementation(async (_e, options) => {
				const html = options.transformPageChunk({
					html: '<!DOCTYPE html><html lang="en"><body></body></html>',
					done: true
				});
				return new Response(html);
			});

			const response = await hook({ event: event as any, resolve });
			const html = await response.text();

			expect(html).toContain('lang="de"');
		});

		it('updates existing lang attribute with single quotes', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({ cookieValue: 'de' });
			const resolve = vi.fn().mockImplementation(async (_e, options) => {
				const html = options.transformPageChunk({
					html: "<!DOCTYPE html><html lang='en'><body></body></html>",
					done: true
				});
				return new Response(html);
			});

			const response = await hook({ event: event as any, resolve });
			const html = await response.text();

			expect(html).toContain("lang='de'");
		});

		it('injects lang attribute when missing', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({ cookieValue: 'fr' });
			const resolve = vi.fn().mockImplementation(async (_e, options) => {
				const html = options.transformPageChunk({
					html: '<!DOCTYPE html><html><body></body></html>',
					done: true
				});
				return new Response(html);
			});

			const response = await hook({ event: event as any, resolve });
			const html = await response.text();

			expect(html).toContain('<html lang="fr">');
		});

		it('injects lang attribute when html has other attributes', async () => {
			const hook = createI18nHook();
			const event = createMockEvent({ cookieValue: 'es' });
			const resolve = vi.fn().mockImplementation(async (_e, options) => {
				const html = options.transformPageChunk({
					html: '<!DOCTYPE html><html class="dark"><body></body></html>',
					done: true
				});
				return new Response(html);
			});

			const response = await hook({ event: event as any, resolve });
			const html = await response.text();

			expect(html).toContain('<html lang="es"');
			expect(html).toContain('class="dark"');
		});
	});

	describe('locale validation (without supportedLocales)', () => {
		it('accepts valid BCP-47 locales', async () => {
			const hook = createI18nHook({ fallbackLocale: 'en' });

			for (const locale of ['en', 'en-US', 'zh-Hans', 'pt-BR']) {
				const event = createMockEvent({ cookieValue: locale });
				const resolve = createMockResolve();
				await hook({ event: event as any, resolve });
				expect(event.locals.locale).toBe(locale);
			}
		});

		it('falls back for invalid locale formats', async () => {
			const hook = createI18nHook({ fallbackLocale: 'en' });

			for (const locale of ['e', '123', 'en_US', 'en.US']) {
				const event = createMockEvent({ cookieValue: locale });
				const resolve = createMockResolve();
				await hook({ event: event as any, resolve });
				expect(event.locals.locale).toBe('en');
			}
		});
	});
});

describe('getLocaleFromLocals', () => {
	it('returns locale from locals', () => {
		const locals = { locale: 'pl' } as App.Locals;
		expect(getLocaleFromLocals(locals)).toBe('pl');
	});

	it('returns fallback when locale not set', () => {
		const locals = {} as App.Locals;
		expect(getLocaleFromLocals(locals, 'de')).toBe('de');
	});

	it('uses en as default fallback', () => {
		const locals = {} as App.Locals;
		expect(getLocaleFromLocals(locals)).toBe('en');
	});
});
