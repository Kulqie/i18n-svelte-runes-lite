# Complete SvelteKit SSR Setup Guide

Step-by-step guide to set up `i18n-svelte-runes-lite` in SvelteKit with **zero flash on page reload**.

> **New in v1.1:** Use the [Magic Hook](./MAGIC_HOOK.md) for simpler setup with automatic HttpOnly cookie persistence!

## Prerequisites

- SvelteKit 2.x
- Svelte 5 with runes mode enabled
- TypeScript (recommended)

---

## Choose Your Approach

| Approach | Security | Setup Complexity | Best For |
|----------|----------|------------------|----------|
| **Magic Hook** (Recommended) | HttpOnly cookies | Simple (4 files) | Production apps |
| **Manual Cookie** | Client-side cookies | Medium (5 files) | Learning/Custom needs |

---

## Option A: Magic Hook (Recommended)

### Step 1: Vite Configuration (CRITICAL)

This package ships TypeScript source files. You **must** configure Vite to process it.

**Edit `vite.config.ts`:**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
  plugins: [sveltekit()],
  // ... your other config

  // REQUIRED for i18n-svelte-runes-lite
  optimizeDeps: {
    exclude: ['i18n-svelte-runes-lite']
  },
  ssr: {
    noExternal: ['i18n-svelte-runes-lite']
  }
};

export default config;
```

> **Why?** Without this, esbuild tries to pre-bundle the TypeScript files and fails with "Unexpected token" errors.

---

## Step 2: Create Translation Files

**`src/lib/i18n/locales/en.json`:**
```json
{
  "hello": "Hello, {{name}}!",
  "items": {
    "zero": "No items",
    "one": "{{count}} item",
    "other": "{{count}} items"
  }
}
```

**`src/lib/i18n/locales/pl.json`:**
```json
{
  "hello": "Cześć, {{name}}!",
  "items": {
    "zero": "Brak elementów",
    "one": "{{count}} element",
    "few": "{{count}} elementy",
    "other": "{{count}} elementów"
  }
}
```

---

## Step 3: Create Locale Configuration

**`src/lib/i18n/locales.ts`:**
```typescript
import type en from './locales/en.json';

export type Schema = typeof en;

// Eager loading (recommended for < 5 languages)
import enJSON from './locales/en.json';
import plJSON from './locales/pl.json';

export const translations = {
  en: enJSON,
  pl: plJSON
};

// Supported locales list (for validation)
export const supportedLocales = ['en', 'pl'] as const;
export type Locale = (typeof supportedLocales)[number];
```

---

## Step 4: TypeScript Types for Locals

**`src/app.d.ts`:**
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

## Step 5: Server Hook

### Option A: Magic Hook (Recommended)

Use the built-in Magic Hook for automatic HttpOnly cookie handling:

**`src/hooks.server.ts`:**
```typescript
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

export const handle = createI18nHook({
  fallbackLocale: 'en',
  supportedLocales: ['en', 'pl']
});
```

The Magic Hook automatically:
- Reads locale from HttpOnly cookie
- Sets `event.locals.locale`
- Handles `/__i18n/save` endpoint for secure persistence
- Injects `<html lang="...">` via `transformPageChunk`

### Option B: Manual Hook

If you need custom logic, implement the hook manually:

**`src/hooks.server.ts`:**
```typescript
import type { Handle } from '@sveltejs/kit';

const supportedLocales = ['en', 'pl'];

export const handle: Handle = async ({ event, resolve }) => {
  // Read locale from cookie, validate, fallback to 'en'
  const cookieLocale = event.cookies.get('locale');
  const locale = cookieLocale && supportedLocales.includes(cookieLocale)
    ? cookieLocale
    : 'en';

  // Make available to load functions
  event.locals.locale = locale;

  return resolve(event, {
    transformPageChunk: ({ html }) => {
      // Set <html lang="..."> for SEO and accessibility
      return html.replace('%sveltekit.html.attributes%', `lang="${locale}"`);
    }
  });
};
```

---

## Step 6: Layout Server Load

Pass locale from server to client.

**`src/routes/+layout.server.ts`:**
```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    locale: locals.locale
  };
};
```

---

## Step 7: Root Layout (Initialize i18n)

### Option A: With Magic Hook (Automatic Persistence)

**`src/routes/+layout.svelte`:**
```svelte
<script lang="ts">
  import { setI18n } from 'i18n-svelte-runes-lite/context';
  import { translations, type Schema } from '$lib/i18n/locales';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Initialize with locale from server
  // Persistence is automatic via Magic Hook!
  setI18n<Schema>({
    translations,
    initialLocale: data.locale,
    fallbackLocale: 'en'
    // strategy: 'auto' (default) - uses bridge with Magic Hook
  });
</script>

{@render children()}
```

### Option B: With Manual Hook (Manual Persistence)

**`src/routes/+layout.svelte`:**
```svelte
<script lang="ts">
  import { setI18n } from 'i18n-svelte-runes-lite/context';
  import { translations, type Schema } from '$lib/i18n/locales';
  import { browser } from '$app/environment';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Initialize with locale from server (read from cookie)
  const i18n = setI18n<Schema>({
    translations,
    initialLocale: data.locale,
    fallbackLocale: 'en',
    strategy: 'none'  // Disable auto-persistence, we'll handle it
  });

  // Persist locale changes to cookie manually (1 year expiry)
  $effect(() => {
    if (browser) {
      document.cookie = `locale=${i18n.locale};path=/;max-age=31536000;SameSite=Lax`;
    }
  });
</script>

{@render children()}
```

---

## Step 8: Use in Components

**`src/routes/+page.svelte`:**
```svelte
<script lang="ts">
  import { useI18n } from 'i18n-svelte-runes-lite/context';
  import type { Schema } from '$lib/i18n/locales';

  const i18n = useI18n<Schema>();
  const { t, setLocale, fmt } = i18n;
</script>

<h1>{t('hello', { name: 'World' })}</h1>

<!-- Language Switcher -->
<button
  onclick={() => setLocale('en')}
  class:active={i18n.locale === 'en'}
>
  English
</button>
<button
  onclick={() => setLocale('pl')}
  class:active={i18n.locale === 'pl'}
>
  Polski
</button>

<!-- Pluralization -->
<p>{t('items', { count: 5 })}</p>

<!-- Formatting (uses Intl API with current locale) -->
<p>{fmt.number(1234.56)}</p>
<p>{fmt.currency(99.99)}</p>
<p>{fmt.date(new Date())}</p>
```

---

## How It Works (No Flash)

### With Magic Hook (Option A)

```
1. User clicks "Polski" → setLocale('pl')
2. Client POSTs to /__i18n/save → { locale: 'pl' }
3. Magic Hook sets HttpOnly cookie
4. User refreshes page
5. Magic Hook reads cookie → event.locals.locale = 'pl'
6. +layout.server.ts passes locale to client
7. Magic Hook injects <html lang="pl">
8. Server renders HTML in Polish
9. Client hydrates with same locale → NO FLASH!
```

### With Manual Hook (Option B)

```
1. User clicks "Polski" → setLocale('pl')
2. $effect saves cookie → locale=pl (client-side)
3. User refreshes page
4. hooks.server.ts reads cookie → locale = 'pl'
5. +layout.server.ts passes locale to client
6. Server renders HTML in Polish
7. Client hydrates with same locale → NO FLASH!
```

---

## Common Issues

### "Unexpected token" error on dev server start
→ Missing Vite config. Add `optimizeDeps.exclude` and `ssr.noExternal`.

### Flash of wrong language on refresh
→ Not using cookies. localStorage doesn't work for SSR.

### TypeScript errors on `data.locale`
→ Missing `+layout.server.ts` or `app.d.ts` types.

### Import errors
→ Use `'i18n-svelte-runes-lite/context'` not `'i18n-svelte-runes-lite/context.svelte'`

### "Bridge endpoint unavailable" in console (Magic Hook)
→ This is normal for static deployments. The library falls back to client-side cookies.

### Locale not persisting with Magic Hook
→ Ensure `/__i18n/save` endpoint isn't blocked by other middleware or hooks. Use `sequence()` to order hooks correctly.

---

## Full File Structure

```
src/
├── app.d.ts                    # TypeScript types for Locals
├── hooks.server.ts             # Magic Hook or manual hook
├── lib/
│   └── i18n/
│       ├── locales.ts          # Schema type + translations export
│       └── locales/
│           ├── en.json
│           └── pl.json
└── routes/
    ├── +layout.server.ts       # Pass locale to client
    ├── +layout.svelte          # Initialize i18n context
    └── +page.svelte            # Use t(), setLocale(), fmt
```

---

## Next Steps

- **Learn more about the Magic Hook:** See [MAGIC_HOOK.md](./MAGIC_HOOK.md) for advanced configuration
- **Wails/SPA setup:** See [SINGLETON.md](./SINGLETON.md) for non-SSR environments
- **Lazy loading:** See [LAZY_LOADING.md](./LAZY_LOADING.md) for on-demand translation loading
