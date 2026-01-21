# Magic Hook - Automatic Locale Persistence

The **Magic Hook** provides one-line setup for secure locale persistence in SvelteKit, with automatic fallbacks for Wails and SPA deployments.

## Why Magic Hook?

| Problem | Magic Hook Solution |
|---------|---------------------|
| Manual cookie handling | Automatic HttpOnly cookie via server |
| Hydration mismatches | Automatic `<html lang>` injection |
| Security (XSS) | HttpOnly cookies (not accessible via JS) |
| Multiple environments | Auto-detects SvelteKit/Wails/SPA |
| Static site fallback | Falls back to client cookie if no server |

---

## Quick Start (SvelteKit)

### Step 1: Add Server Hook

```typescript
// src/hooks.server.ts
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

export const handle = createI18nHook({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl', 'de']
});
```

### Step 2: Pass Locale to Client

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    return { locale: locals.locale };
};
```

### Step 3: Initialize i18n

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { setI18n } from 'i18n-svelte-runes-lite/context';
    import { translations, type Schema } from '$lib/i18n/locales';
    import type { Snippet } from 'svelte';

    let { children, data }: { children: Snippet; data: { locale: string } } = $props();

    setI18n<Schema>({
        translations,
        initialLocale: data.locale,
        fallbackLocale: 'en'
        // strategy: 'auto' is default - uses bridge for SvelteKit
    });
</script>

{@render children()}
```

### Step 4: Use It!

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { useI18n } from 'i18n-svelte-runes-lite/context';
    import type { Schema } from '$lib/i18n/locales';

    const i18n = useI18n<Schema>();
    const { t, setLocale } = i18n;
</script>

<h1>{t('hello')}</h1>

<button onclick={() => setLocale('en')}>English</button>
<button onclick={() => setLocale('pl')}>Polski</button>

<!-- Locale persists automatically via HttpOnly cookie! -->
```

**That's it!** When users change locale, it's automatically persisted. On page refresh, SSR renders in the correct language.

---

## How It Works

```
1. User clicks "Polski" → setLocale('pl')
2. Client POSTs to /__i18n/save with { locale: 'pl' }
3. Server hook sets HttpOnly cookie
4. User refreshes page
5. Server hook reads cookie → event.locals.locale = 'pl'
6. +layout.server.ts passes locale to client
7. Server renders <html lang="pl"> with Polish content
8. Client hydrates with same locale → NO FLASH!
```

---

## TypeScript Setup

Add to `src/app.d.ts`:

```typescript
declare global {
    namespace App {
        interface Locals {
            locale: string;
        }
    }
}

export {};
```

---

## Configuration Options

### Server Hook Options

```typescript
createI18nHook({
    // Required
    fallbackLocale: 'en',              // Default when no cookie
    supportedLocales: ['en', 'pl'],    // Validate against these

    // Optional
    cookieName: 'locale',              // Cookie name (default: 'locale')
    endpoint: '/__i18n/save',          // Bridge endpoint (default: '/__i18n/save')
    cookieMaxAge: 31536000,            // 1 year in seconds
    cookiePath: '/',
    cookieSameSite: 'lax',             // 'strict' | 'lax' | 'none'
    cookieSecure: undefined            // Auto-detect from URL protocol
});
```

### Client Options

```typescript
createI18n({
    translations,
    initialLocale: data.locale,

    // Persistence strategy
    strategy: 'auto',                   // 'auto' | 'bridge' | 'cookie' | 'localStorage' | 'none'
    persistenceEndpoint: '/__i18n/save', // Must match server hook
    reloadOnChange: false,              // Reload page after persistence?
    environment: 'auto'                 // 'auto' | 'sveltekit' | 'wails' | 'spa'
});
```

---

## Persistence Strategies

| Strategy | When Used | Cookie Type | Best For |
|----------|-----------|-------------|----------|
| `bridge` | SvelteKit with server | HttpOnly | Production apps (most secure) |
| `cookie` | SPA without server | Client-side | Static sites |
| `localStorage` | Wails desktop | localStorage | Desktop apps |
| `auto` | Auto-detect | Depends | Let the library decide |
| `none` | Disabled | None | Testing |

### Auto-Detection Logic

```
1. Is window.runtime or window.Wails defined?
   → Yes: Use 'localStorage' (Wails desktop app)

2. Otherwise:
   → Use 'bridge' (SvelteKit)
   → Falls back to 'cookie' if bridge fails (static deployment)
```

---

## Environment-Specific Examples

### Wails Desktop App

No server hook needed - uses localStorage automatically:

```typescript
// src/lib/i18n/index.ts
import { createI18n } from 'i18n-svelte-runes-lite';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const i18n = createI18n<typeof en>({
    translations: { en, pl },
    initialLocale: 'en',
    strategy: 'auto'  // Auto-detects Wails, uses localStorage
});

export const { t, setLocale } = i18n;
```

### Static Site (SSG)

Bridge will fail gracefully and fall back to client cookie:

```typescript
// Same setup as SvelteKit, but when deployed statically:
// - Bridge POST fails (no server)
// - Falls back to document.cookie
// - Still works, just not HttpOnly
```

### Force Specific Strategy

```typescript
// Force localStorage even in SvelteKit
createI18n({
    translations,
    initialLocale: 'en',
    strategy: 'localStorage'  // Override auto-detection
});

// Disable persistence entirely
createI18n({
    translations,
    initialLocale: 'en',
    strategy: 'none'
});
```

---

## Composing with Other Hooks

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

const i18nHook = createI18nHook({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl']
});

const authHook: Handle = async ({ event, resolve }) => {
    // Your auth logic
    return resolve(event);
};

export const handle = sequence(i18nHook, authHook);
```

---

## Reload After Locale Change

By default, locale changes are applied client-side instantly. If you need the server to re-render with the new locale (for SEO or server-dependent content):

```typescript
createI18n({
    translations,
    initialLocale: data.locale,
    reloadOnChange: true  // Page reloads after successful bridge call
});
```

---

## Security Considerations

### HttpOnly Cookies

The Magic Hook sets HttpOnly cookies, which:
- Cannot be accessed via JavaScript (XSS protection)
- Are only sent to the server
- Require the server hook to read/write

### Locale Validation

The server hook validates locales against `supportedLocales`:

```typescript
createI18nHook({
    supportedLocales: ['en', 'pl', 'de']  // Only these are accepted
});

// If user tries to set locale to 'malicious-script':
// → Ignored, falls back to fallbackLocale
```

### Cookie Security Flags

```typescript
createI18nHook({
    cookieSameSite: 'strict',  // Strictest CSRF protection
    cookieSecure: true         // HTTPS only (auto-detected by default)
});
```

#### SameSite Options Explained

| Value | Behavior | Use When |
|-------|----------|----------|
| `'lax'` (default) | Cookie sent on top-level navigations and GET from external sites | Most applications - good balance of security and usability |
| `'strict'` | Cookie only sent for same-site requests | High-security apps where locale shouldn't leak via referrer |
| `'none'` | Cookie sent on all requests (requires `Secure`) | Cross-origin scenarios (rare for locale) |

**When to use `'strict'`:**
- Banking/financial applications
- Healthcare applications with HIPAA compliance
- Any app where knowing the user's locale preference is considered sensitive
- Apps that want maximum CSRF protection

**When `'lax'` is fine (most apps):**
- Locale preference is not sensitive data
- You want the locale to persist when users click links from emails/external sites
- Standard web applications without elevated security requirements

```typescript
// High-security configuration
createI18nHook({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl'],
    cookieSameSite: 'strict',
    cookieSecure: true,      // Force HTTPS even in development
    cookieMaxAge: 86400 * 30 // 30 days instead of 1 year
});
```

---

## Troubleshooting

### "Bridge endpoint unavailable" in console

**Cause:** The `/__i18n/save` endpoint isn't responding.

**Solutions:**
1. Check that `hooks.server.ts` is set up correctly
2. For static sites, this is expected - the library falls back to client cookie
3. Ensure `persistenceEndpoint` matches on both server and client

### Hydration mismatch warnings

**Cause:** Server and client have different locales.

**Solutions:**
1. Ensure `+layout.server.ts` passes `locals.locale` to client
2. Use `initialLocale: data.locale` (not a hardcoded value)
3. Check that the server hook is running before your layout

### Locale not persisting on refresh

**Cause:** Cookie not being set or read.

**Solutions:**
1. Check browser DevTools → Application → Cookies
2. Ensure `supportedLocales` includes your locale
3. For Wails: Check localStorage instead of cookies

### TypeScript errors on `locals.locale`

**Cause:** Missing type declaration.

**Solution:** Add to `src/app.d.ts`:
```typescript
declare global {
    namespace App {
        interface Locals {
            locale: string;
        }
    }
}
export {};
```

---

## Complete File Structure

```
src/
├── app.d.ts                    # TypeScript: App.Locals.locale
├── app.html                    # <html lang="%lang%"> (optional with hook)
├── hooks.server.ts             # Magic Hook (createI18nHook)
├── lib/
│   └── i18n/
│       ├── locales.ts          # Schema type + translations
│       └── locales/
│           ├── en.json
│           └── pl.json
└── routes/
    ├── +layout.server.ts       # Pass locale to client
    ├── +layout.svelte          # setI18n with data.locale
    └── +page.svelte            # useI18n → t(), setLocale()
```

---

## Migration from Manual Setup

If you're currently using manual cookie handling in `$effect`:

**Before:**
```svelte
<script>
    import { browser } from '$app/environment';

    $effect(() => {
        if (browser) {
            document.cookie = `locale=${i18n.locale};path=/;max-age=31536000`;
        }
    });
</script>
```

**After:**
```svelte
<script>
    // Just remove the $effect - persistence is automatic!
    // setLocale() handles everything now.
</script>
```

And add the server hook for HttpOnly cookie security.
