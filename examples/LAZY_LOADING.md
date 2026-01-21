# Lazy Loading Translations

Lazy loading allows you to load translation files **on-demand**, reducing the initial bundle size and improving startup performance.

## When to Use Lazy Loading?

✅ **Use lazy loading when:**
- You have 5+ languages
- Translation files are > 10KB each
- Users typically only use 1-2 languages
- You want to optimize initial page load

❌ **Don't use when:**
- You have 2-3 small languages
- All users need all languages immediately
- You're building a Wails desktop app (files are local anyway)

## Basic Setup

### Step 1: Define Loaders

```typescript
// src/lib/i18n/index.ts
import { createI18n } from 'i18n-svelte-runes-lite';

// Type definition
import type enJSON from './locales/en.json';
type Schema = typeof enJSON;

// Dynamic loaders
const i18n = createI18n<Schema>({
    translations: {
        en: () => import('./locales/en.json')  // Default, eager load
    },
    loaders: {
        pl: () => import('./locales/pl.json'),
        de: () => import('./locales/de.json'),
        fr: () => import('./locales/fr.json'),
        es: () => import('./locales/es.json')
    },
    initialLocale: 'en',
    fallbackLocale: 'en'
});

export const t = i18n.t;
export const setLocale = i18n.setLocale;
export const loadLocale = i18n.loadLocale;

// ⚠️ IMPORTANT: Do NOT export locale or isLoadingLocale as const!
// These are getters that return primitive values. Exporting them captures
// the value once at module load time, breaking reactivity.
//
// ❌ WRONG: export const locale = i18n.locale;  // Captured once, never updates!
// ✅ CORRECT: Export the i18n object and access locale through it

// Export instance - use i18n.locale and i18n.isLoadingLocale for reactivity
export { i18n };
```

### Step 2: Use in Components

```svelte
<!-- LanguageSwitcher.svelte -->
<script>
    import { i18n, setLocale } from '$lib/i18n';

    async function changeToPolish() {
        // Automatically loads pl.json if not loaded
        await setLocale('pl');
    }

    async function changeToGerman() {
        // Automatically loads de.json if not loaded
        await setLocale('de');
    }
</script>

<button onclick={() => setLocale('en')}>English</button>
<button onclick={changeToPolish}>Polski</button>
<button onclick={changeToGerman}>Deutsch</button>

<!-- Use i18n.isLoadingLocale for reactivity! -->
{#if i18n.isLoadingLocale}
    <p class="loading">Loading translations...</p>
{/if}

<style>
    .loading {
        opacity: 0.6;
        font-style: italic;
    }
</style>
```

## Advanced Patterns

### Pre-load on Hover

Load translations when user hovers over the language button (before clicking):

```svelte
<script>
    import { setLocale, loadLocale } from '$lib/i18n';

    async function preloadLocale(locale: string) {
        await loadLocale(locale);
    }

    async function switchTo(locale: string) {
        await setLocale(locale); // Instant if pre-loaded
    }
</script>

<button
    onmouseenter={() => preloadLocale('pl')}
    onclick={() => switchTo('pl')}
>
    Polski
</button>
```

### Pre-load on Route Change

Load translations when navigating to a language-specific route:

```svelte
<!-- src/routes/[lang]/+layout.svelte -->
<script lang="ts">
    import { setLocale, loadLocale } from '$lib/i18n';
    import { onMount } from 'svelte';

    // Svelte 5 runes mode: use $props() instead of export let
    let { data } = $props();

    onMount(async () => {
        // Pre-load translations while page renders
        await loadLocale(data.locale);
        await setLocale(data.locale);
    });
</script>

<slot />
```

### Detect and Pre-load Browser Language

```typescript
// src/lib/i18n/index.ts
import { browser } from '$app/environment';

// Detect browser language
function getBrowserLocale(): string {
    if (!browser) return 'en';

    const browserLang = navigator.language.split('-')[0]; // 'pl-PL' -> 'pl'

    // Check if we support this locale
    if (i18n.isLocaleSupported(browserLang)) {
        return browserLang;
    }

    return 'en'; // Fallback
}

// Initialize with detected locale
const initialLocale = getBrowserLocale();

const i18n = createI18n<Schema>({
    translations: { en },
    loaders: { pl: () => import('./locales/pl.json') },
    initialLocale,
    fallbackLocale: 'en'
});

// Pre-load detected locale
if (initialLocale !== 'en') {
    loadLocale(initialLocale);
}
```

### Show Loading State

```svelte
<script>
    import { i18n, setLocale } from '$lib/i18n';

    let loadingTimeout: number;

    function switchLocale(newLocale: string) {
        // Show loading after 300ms to avoid flicker
        loadingTimeout = setTimeout(() => {
            console.log('Loading translations...');
        }, 300);

        setLocale(newLocale).finally(() => {
            clearTimeout(loadingTimeout);
        });
    }

    $effect(() => {
        // Use i18n.locale for reactivity!
        console.log('Locale changed to:', i18n.locale);
    });
</script>

<div class="lang-switcher">
    <button
        disabled={i18n.isLoadingLocale}
        onclick={() => switchLocale('pl')}
    >
        Polski
    </button>

    {#if i18n.isLoadingLocale}
        <span class="spinner">⟳</span>
    {/if}
</div>

<style>
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .spinner {
        display: inline-block;
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
```

### Load Multiple Locales in Parallel

```svelte
<script>
    import { loadLocale, setLocale } from '$lib/i18n';

    async function loadAllLanguages() {
        // Load all in parallel
        await Promise.all([
            loadLocale('pl'),
            loadLocale('de'),
            loadLocale('fr')
        ]);

        console.log('All languages loaded!');
    }

    // Call this during app initialization
    onMount(() => {
        loadAllLanguages(); // Optional: pre-load everything
    });
</script>
```

## Bundle Size Comparison

### Eager Loading (old way)

```
bundle.js    150 KB  (includes en + pl + de + fr)
```

### Lazy Loading (new way)

```
bundle.js     40 KB  (includes en only)
pl.chunk.js   35 KB  (loaded on demand)
de.chunk.js   35 KB  (loaded on demand)
fr.chunk.js   35 KB  (loaded on demand)
```

**Savings:** 110 KB on initial load (73% reduction!)

## Error Handling

```typescript
// src/lib/i18n/index.ts
async function switchLocale(locale: string) {
    try {
        await setLocale(locale);
    } catch (error) {
        console.error('Failed to load locale:', error);

        // Fallback to a safe locale
        await setLocale('en');
        alert(`Could not load ${locale}. Falling back to English.`);
    }
}
```

## TypeScript Support

Loaders are fully typed:

```typescript
const i18n = createI18n<typeof en>({
    loaders: {
        en: () => import('./locales/en.json'), // ✅ Type checked
        pl: () => import('./locales/pl.json'), // ✅ Type checked
        de: () => import('./locales/de.json')  // ✅ Type checked
    }
});
```

## Performance Tips

1. **Pre-load on hover** - Reduces perceived latency
2. **Show loading state** - Better UX during fetch
3. **Cache in Service Worker** - No network after first load
4. **Compress JSON** - Use gzip/brotli on server
5. **Split large files** - Break into chunks by feature

## SvelteKit Integration

For SvelteKit, use loaders with Context API:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { setI18n } from 'i18n-svelte-runes-lite/context.svelte';
    import en from '$lib/locales/en.json';

    const i18n = setI18n<typeof en>({
        translations: { en },
        loaders: {
            pl: () => import('$lib/locales/pl.json')
        },
        initialLocale: 'en'
    });
</script>

{@render children()}
```

Then in `+page.svelte`:

```svelte
<script lang="ts">
    import { useI18n } from 'i18n-svelte-runes-lite/context.svelte';
    import type en from '$lib/locales/en.json';

    const { setLocale, isLoadingLocale } = useI18n<typeof en>();
</script>
```

## Monitoring

Track how long locales take to load:

```typescript
async function loadLocaleWithMetrics(locale: string) {
    const start = performance.now();

    await loadLocale(locale);

    const duration = performance.now() - start;
    console.log(`Loaded ${locale} in ${duration.toFixed(2)}ms`);

    // Send to analytics
    // analytics.track('locale_loaded', { locale, duration });
}
```

## FAQ

**Q: Does lazy loading work in Wails?**
- Yes, but files are local so it's instant. Not really needed.

**Q: Can I mix eager and lazy loading?**
- Yes! Load `en` eagerly, others lazily.

**Q: What if loading fails?**
- Handle errors in try/catch, fallback to `en`.

**Q: Are loaded locales cached?**
- Yes, by the browser/module system.

**Q: Can I preload everything in background?**
- Yes, use `Promise.all([loadLocale('pl'), ...])` in `onMount`.
