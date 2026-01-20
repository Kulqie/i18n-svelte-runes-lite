# SvelteKit SSR Usage Guide

This guide shows how to use `i18n-svelte-runes-lite` with **SvelteKit SSR** while avoiding state pollution.

## Why Context API?

In SvelteKit SSR, module-level singletons are shared across all requests, causing **state pollution**:
- User A sets locale to 'pl' → User B's request will also see 'pl'
- The solution is **Svelte Context API**, which provides per-request isolation.

## Quick Setup

### Step 1: Define Locale Loaders

Create a file `src/lib/i18n/locales.ts`:

```typescript
// src/lib/i18n/locales.ts
import type enJSON from './locales/en.json';
import type plJSON from './locales/pl.json';

export type Schema = typeof enJSON;

// Dynamic loaders for lazy loading
export const localeLoaders = {
    en: () => import('./locales/en.json'),
    pl: () => import('./locales/pl.json')
};

// Or eager load everything (simpler but slower)
import en from './locales/en.json';
import pl from './locales/pl.json';
export const translations = { en, pl };
```

### Step 2: Set up Context in Root Layout

Create/Edit `src/routes/+layout.svelte`:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { setI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
    import { localeLoaders, type Schema } from '$lib/i18n/locales';

    // Option A: Lazy loading (recommended for SvelteKit)
    const i18n = setI18n<Schema>({
        loaders: localeLoaders,
        initialLocale: 'en',
        fallbackLocale: 'en'
    });

    // Option B: Eager loading (simpler, good for < 5 languages)
    // import { translations } from '$lib/i18n/locales';
    // const i18n = setI18n<Schema>({
    //     translations,
    //     initialLocale: 'en'
    // });
</script>

<slot />
```

### Step 3: Use in Components

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { useI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';

    // Get i18n instance from context
    // ✅ Keep reference to i18n object for reactive locale access
    const i18n = useI18n<Schema>();

    // ✅ Destructuring functions is safe
    const { t, setLocale, fmt } = i18n;

    // ❌ WRONG: const { locale } = i18n; // Captures value, loses reactivity!
</script>

<h1>{t('welcome.title')}</h1>
<p>{t('welcome.subtitle', { name: 'World' })}</p>

<button onclick={() => setLocale('en')}>English</button>
<button onclick={() => setLocale('pl')}>Polski</button>

<p>Price: {fmt.currency(123.45)}</p>
<!-- ✅ Access locale through i18n object for reactivity -->
<p>Current locale: {i18n.locale}</p>
```

### Step 4: Detect Locale from URL (Optional)

Create `src/routes/[lang]/+layout.svelte` for URL-based locale:

```svelte
<script lang="ts">
    import { setI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
    import { localeLoaders, type Schema } from '$lib/i18n/locales';
    import type { PageData } from './$types';

    // Svelte 5 runes mode: use $props() instead of export let
    let { data }: { data: PageData } = $props();

    const i18n = setI18n<Schema>({
        loaders: localeLoaders,
        initialLocale: data.locale // from server
    });
</script>

<slot />
```

Server-side (`src/routes/[lang]/+layout.server.ts`):

```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
    return {
        locale: params.lang || 'en'
    };
};
```

## Important: Reactivity in Svelte 5

In Svelte 5 runes mode, calling `t()` in the top-level script scope does **not** automatically create a reactive binding:

```svelte
<script>
  const { t } = useI18n();

  // ❌ NOT reactive - won't update when locale changes
  const title = t('page.title');

  // ✅ Reactive - updates when locale changes
  let title = $derived(t('page.title'));
</script>

<!-- ✅ Always reactive in template markup -->
<h1>{t('page.title')}</h1>
```

**Rule of thumb:**
- In **template** (`{...}`): Always reactive automatically
- In **script**: Wrap in `$derived()` for reactivity

## Advanced Patterns

### Persist Locale in Cookie & Set SSR Lang Attribute

For proper SEO and accessibility, the `lang` attribute must be set server-side:

**1. Update `src/app.html`:**
```html
<!DOCTYPE html>
<html lang="%lang%">
<!-- rest of your html -->
```

**2. Create/update `src/hooks.server.ts`:**
```typescript
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // Get locale from cookie, URL param, or Accept-Language header
    const locale = event.cookies.get('locale') || 'en';

    return resolve(event, {
        transformPageChunk: ({ html }) => {
            // Replace %lang% placeholder with actual locale for SSR
            return html.replace('%lang%', locale);
        }
    });
};
```

### Load Locale on Navigation

```svelte
<script>
    import { useI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
    import { goto } from '$app/navigation';

    // Keep reference to i18n object for reactive state access
    const i18n = useI18n();
    const { setLocale } = i18n;

    async function changeLocale(newLocale: string) {
        await setLocale(newLocale, true); // true = lazy load

        // Update URL
        await goto(`/${newLocale}`, { replaceState: true });
    }
</script>

<!-- Access isLoadingLocale through i18n object for reactivity -->
{#if i18n.isLoadingLocale}
    <p>Loading translations...</p>
{/if}

<button onclick={() => changeLocale('en')}>English</button>
```

### Server-Side Rendering with Loaders

```svelte
<!-- src/routes/+layout.svelte -->
<script>
    import { setI18n } from '$lib/i18n-svelte-runes-lite/context.svelte';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    let i18n;

    onMount(async () => {
        if (browser) {
            // Pre-load user's preferred locale on client
            const savedLocale = localStorage.getItem('locale');
            if (savedLocale) {
                await i18n.loadLocale(savedLocale);
                await i18n.setLocale(savedLocale);
            }
        }
    });

    // Initialize with fallback locale (always loaded)
    i18n = setI18n({
        loaders: localeLoaders,
        initialLocale: 'en', // fast SSR
        fallbackLocale: 'en'
    });
</script>
```

## Type Safety

You get full TypeScript autocomplete:

```typescript
// Automatically inferred from your en.json
t('nav.dashboard');      // ✅ Works
t('nav.missing');        // ❌ TypeScript error
t('nav.dashboard', {    // ✅ Parameters typed
    count: 5,
    name: 'John'
});
```

## Avoiding Hydration Mismatches

**Important:** If you don't set up the `%lang%` replacement in `hooks.server.ts`, you may see hydration warnings in the console.

The library sets `document.documentElement.lang` on the client side, but this must match what the server sends. If the server sends `<html>` or `<html lang="en">` but the client initializes with `'pl'`, SvelteKit will warn about a hydration mismatch.

**To avoid this:**
1. Always use the `%lang%` placeholder in `src/app.html`
2. Always set up `transformPageChunk` in `hooks.server.ts` (see above)
3. Ensure the locale passed to `createI18n`/`setI18n` matches what the server uses

## FAQ

**Q: Should I use lazy loading or eager loading?**
- **Eager**: Load all translations upfront. Good for < 5 languages.
- **Lazy**: Load on-demand. Good for 5+ languages or large translation files.

**Q: Why can't I use the singleton pattern?**
- In SvelteKit SSR, singletons are shared across all requests
- Context API ensures each request has its own isolated state

**Q: Can I use this in Wails/SPA too?**
- Yes! But you don't need Context API in SPA
- Use the standard singleton pattern instead (see SPA guide)

**Q: How do I handle missing translations?**
- The library automatically falls back to `fallbackLocale`
- Check browser console for warnings about missing keys

**Q: I'm getting hydration mismatch warnings for the lang attribute?**
- Make sure `src/app.html` uses `<html lang="%lang%">`
- Ensure `hooks.server.ts` replaces `%lang%` with the correct locale
- The locale on the server must match what `createI18n` uses on the client
