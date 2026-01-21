# Namespace-Level Loading

Namespaces allow you to split translations by **feature or route** rather than loading everything at once. This is ideal for large applications where different pages use different translation keys.

> **Default for SvelteKit**: When running `npx i18n-setup`, namespaced structure is now the default for SvelteKit projects. This provides better SSR support, parallel loading, and client-side caching out of the box.

## When to Use Namespaces?

✅ **Use namespaces when:**
- Your app has distinct feature areas (dashboard, admin, settings)
- Different routes use completely different translation keys
- You want to reduce initial bundle size per page
- You're building a large application with 50+ translation keys

❌ **Don't use when:**
- You have a small app with < 50 translation keys
- Most translations are shared across all pages
- You're building a simple SPA or Wails app

## Comparison: Locale vs Namespace Loading

| Aspect | Locale Loading | Namespace Loading |
|--------|----------------|-------------------|
| Splits by | Language (en, pl, de) | Feature (common, dashboard, admin) |
| Use case | Multi-language apps | Large apps with distinct areas |
| Config | `loaders` | `namespaceLoaders` |
| Load function | `loadLocale('pl')` | `loadNamespace('dashboard')` |

## Basic Setup

### Step 1: Organize Translation Files

```
src/lib/i18n/locales/
├── en/
│   ├── common.json      # Shared translations
│   ├── dashboard.json   # Dashboard-specific
│   ├── admin.json       # Admin panel
│   └── settings.json    # Settings page
└── pl/
    ├── common.json
    ├── dashboard.json
    ├── admin.json
    └── settings.json
```

### Step 2: Configure Namespace Loaders

```typescript
// src/lib/i18n/config.ts
import type { NamespaceLoaders } from 'i18n-svelte-runes-lite';

export const namespaceLoaders: Record<string, NamespaceLoaders> = {
    en: {
        common: () => import('./locales/en/common.json'),
        dashboard: () => import('./locales/en/dashboard.json'),
        admin: () => import('./locales/en/admin.json'),
        settings: () => import('./locales/en/settings.json')
    },
    pl: {
        common: () => import('./locales/pl/common.json'),
        dashboard: () => import('./locales/pl/dashboard.json'),
        admin: () => import('./locales/pl/admin.json'),
        settings: () => import('./locales/pl/settings.json')
    }
};
```

### Step 3: Initialize with Namespace Support

```svelte
<!-- +layout.svelte -->
<script lang="ts">
    import { setI18n } from 'i18n-svelte-runes-lite/context';
    import { namespaceLoaders } from '$lib/i18n/config';

    let { data } = $props();

    setI18n({
        namespaceLoaders,
        initialLocale: data.locale,
        defaultNamespace: 'common'
    });
</script>

{@render children()}
```

### Step 4: Load Namespaces in Routes

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
    import { useI18n } from 'i18n-svelte-runes-lite/context';
    import { onMount } from 'svelte';

    const { t, loadNamespace, isNamespaceLoaded, isLoadingNamespace } = useI18n();

    onMount(async () => {
        if (!isNamespaceLoaded('dashboard')) {
            await loadNamespace('dashboard');
        }
    });
</script>

{#if isLoadingNamespace}
    <p>Loading...</p>
{:else}
    <h1>{t('dashboard.title')}</h1>
    <p>{t('dashboard.welcome')}</p>
{/if}
```

## SSR with Namespaces

When using SSR (Server-Side Rendering), the server loads namespaces and renders HTML. The client needs to know which namespaces were already loaded to avoid re-fetching.

### The Problem

Without `ssrLoadedNamespaces`:
1. Server loads `common` + `dashboard` namespaces, renders HTML
2. Client hydrates but `loadedNamespaces` is empty
3. `isNamespaceLoaded('dashboard')` returns `false` (incorrect!)
4. `loadNamespace('dashboard')` tries to re-fetch (unnecessary!)
5. Components may show loading states for already-loaded content

### The Solution: `ssrLoadedNamespaces`

Pass the list of namespaces loaded during SSR to the client:

```typescript
// +page.server.ts
export const load = async ({ locals }) => {
    const locale = locals.locale;

    // Load namespaces needed for this page
    const common = await import(`$lib/i18n/locales/${locale}/common.json`);
    const dashboard = await import(`$lib/i18n/locales/${locale}/dashboard.json`);

    return {
        locale,
        ssrTranslations: {
            ...common.default,
            ...dashboard.default
        },
        loadedNamespaces: ['common', 'dashboard']
    };
};
```

```svelte
<!-- +layout.svelte -->
<script lang="ts">
    import { setI18n } from 'i18n-svelte-runes-lite/context';
    import { namespaceLoaders } from '$lib/i18n/config';

    let { data } = $props();

    setI18n({
        namespaceLoaders,
        initialLocale: data.locale,
        ssrLoadedTranslations: { [data.locale]: data.ssrTranslations },
        ssrLoadedNamespaces: { [data.locale]: data.loadedNamespaces }
    });
</script>

{@render children()}
```

Now:
- `isNamespaceLoaded('dashboard')` returns `true` immediately
- `loadNamespace('dashboard')` returns without fetching
- No unnecessary loading states or flicker

### SvelteKit Per-Page Namespace Loading

In SvelteKit, `setI18n()` is called once in `+layout.svelte`, but different pages may load different namespaces in their `+page.server.ts`. On client-side navigation, the i18n instance already exists and can't be re-initialized.

**The problem with client-side navigation:**

```
Initial load: /dashboard → ssrLoadedNamespaces = ['common', 'dashboard'] ✅
Navigate to:  /admin     → server pre-loaded 'admin', but client doesn't know ❌
```

**Solution: `addSsrLoadedNamespaces()`**

Use this method in page components to inform the client about namespaces the server already loaded:

```typescript
// src/routes/admin/+page.server.ts
export const load = async ({ locals }) => {
    const locale = locals.locale;

    const common = await import(`$lib/i18n/locales/${locale}/common.json`);
    const admin = await import(`$lib/i18n/locales/${locale}/admin.json`);

    return {
        locale,
        ssrTranslations: { ...common.default, ...admin.default },
        loadedNamespaces: ['common', 'admin']
    };
};
```

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
    import { useI18n } from 'i18n-svelte-runes-lite/context';

    let { data } = $props();
    const { addSsrLoadedNamespaces, t } = useI18n();

    // Mark namespaces that server already loaded for this page
    // This prevents re-fetching on client-side navigation
    addSsrLoadedNamespaces(data.locale, data.loadedNamespaces);
</script>

<h1>{t('admin.title')}</h1>
<p>{t('admin.welcome')}</p>
```

**How it works:**

1. **Initial page load** (`/dashboard`):
   - `ssrLoadedNamespaces` in config marks `['common', 'dashboard']` as loaded

2. **Client-side navigation** to `/admin`:
   - SvelteKit fetches page data (including `loadedNamespaces: ['common', 'admin']`)
   - `+page.svelte` calls `addSsrLoadedNamespaces(locale, ['common', 'admin'])`
   - `isNamespaceLoaded('admin')` now returns `true`
   - No unnecessary re-fetch!

3. **Back navigation** to `/dashboard`:
   - `dashboard` namespace is still in `loadedNamespaces` (cached)
   - Everything works instantly

## Dynamic Locale Loading with `onLocaleChange` Hook

When using namespaced translations in SvelteKit, you often want to dynamically load translations when the user switches languages. The `onLocaleChange` hook provides a clean way to do this without manually configuring `namespaceLoaders`.

### The Problem with Manual Namespace Loaders

Setting up `namespaceLoaders` for every locale and namespace is verbose:

```typescript
// Verbose manual configuration
const namespaceLoaders = {
    en: {
        common: () => import('./locales/en/common.json'),
        dashboard: () => import('./locales/en/dashboard.json'),
    },
    pl: {
        common: () => import('./locales/pl/common.json'),
        dashboard: () => import('./locales/pl/dashboard.json'),
    },
    de: {
        common: () => import('./locales/de/common.json'),
        dashboard: () => import('./locales/de/dashboard.json'),
    }
};
```

### The Solution: `onLocaleChange` Hook

The `onLocaleChange` hook is called when `setLocale()` is invoked. It allows you to load translations dynamically and return them to be merged into the store:

```svelte
<!-- +layout.svelte -->
<script lang="ts">
    import { setI18n } from 'i18n-svelte-runes-lite/context';
    import { defaultLocale, loadLocale } from '$lib/i18n/locales';

    let { data, children } = $props();

    setI18n({
        translations: data.translations ?? {},
        initialLocale: data.locale ?? defaultLocale,
        // Track SSR-loaded namespaces for hydration
        ssrLoadedNamespaces: data.loadedNamespaces
            ? { [data.locale]: data.loadedNamespaces }
            : undefined,
        // Dynamically load translations when locale changes
        onLocaleChange: async (newLocale) => {
            const namespaces = data.loadedNamespaces ?? ['common'];
            return await loadLocale(newLocale, namespaces);
        }
    });
</script>

{@render children()}
```

### Generated `loadLocale` Helper

When you run `npx i18n-setup` for SvelteKit with namespaced structure (now the default), the CLI generates a `locales.ts` file with helper functions:

```typescript
// Generated in src/lib/i18n/locales.ts
export const defaultLocale = 'en';
export const supportedLocales = ['en', 'pl'] as const;

// Client-side cache to avoid re-fetching
const namespaceCache = new Map();

export async function loadNamespace(locale, namespace) {
    // Handles caching on client, fallback to defaultLocale, etc.
}

export async function loadLocale(locale, namespaces = ['common']) {
    // Loads multiple namespaces in parallel
    const results = await Promise.all(
        namespaces.map(ns => loadNamespace(locale, ns))
    );
    return Object.assign({}, ...results);
}

export function preloadNamespace(locale, namespace) {
    // Non-blocking prefetch
}
```

### How It Works

1. **SSR**: Server loads translations in `+layout.server.ts` and passes them to client
2. **Initial hydration**: Client receives translations via `data.translations`
3. **Locale change**: User clicks language switcher, `setLocale('pl')` is called
4. **Hook invoked**: `onLocaleChange('pl', 'en')` is called
5. **Dynamic load**: Hook calls `loadLocale('pl', ['common'])` to fetch translations
6. **Merge**: Returned translations are merged into the store
7. **Update**: UI updates with new translations

### Race Condition Protection

The `onLocaleChange` hook is race-condition safe. If the user rapidly switches languages (en → pl → de), only the last locale change takes effect:

```
Click "Polski"  → onLocaleChange('pl', 'en') starts loading...
Click "Deutsch" → onLocaleChange('de', 'pl') starts loading...
...
'de' response arrives → locale set to 'de' ✅
'pl' response arrives → ignored (outdated request) ✅
```

### Caching Benefits

The generated `loadLocale` function includes client-side caching:

- First load of `en/common.json` → network fetch
- Switch to `pl` → network fetch for `pl/common.json`
- Switch back to `en` → served from cache (instant!)

This is especially useful for language switchers where users may toggle between languages.

## Advanced Patterns

### Vite Glob Pattern for Dynamic Loaders

Use Vite's glob imports to auto-generate namespace loaders:

```typescript
// src/lib/i18n/config.ts
const localeModules = import.meta.glob('./locales/*/*.json');

function createNamespaceLoaders(): Record<string, NamespaceLoaders> {
    const loaders: Record<string, NamespaceLoaders> = {};

    for (const path of Object.keys(localeModules)) {
        // path: './locales/en/dashboard.json'
        const match = path.match(/\.\/locales\/(\w+)\/(\w+)\.json$/);
        if (match) {
            const [, locale, namespace] = match;
            loaders[locale] ??= {};
            loaders[locale][namespace] = localeModules[path] as () => Promise<any>;
        }
    }

    return loaders;
}

export const namespaceLoaders = createNamespaceLoaders();
```

### Pre-load on Route Navigation

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
    import { useI18n } from 'i18n-svelte-runes-lite/context';
    import { beforeNavigate } from '$app/navigation';

    const { loadNamespace } = useI18n();

    // Pre-load admin namespace when navigating to admin routes
    beforeNavigate(({ to }) => {
        if (to?.route.id?.startsWith('/admin')) {
            loadNamespace('admin');
        }
    });
</script>
```

### Load Multiple Namespaces

```typescript
async function loadPageNamespaces() {
    await Promise.all([
        loadNamespace('common'),
        loadNamespace('dashboard'),
        loadNamespace('charts')
    ]);
}
```

### Check Available Namespaces

```typescript
const { getAvailableNamespaces } = useI18n();

// Get all namespaces defined for current locale
const namespaces = getAvailableNamespaces();
// ['common', 'dashboard', 'admin', 'settings']

// Get namespaces for specific locale
const plNamespaces = getAvailableNamespaces('pl');
```

## API Reference

### Config Options

```typescript
interface I18nConfigWithNamespaces {
    // Namespace loaders per locale
    namespaceLoaders?: Record<string, NamespaceLoaders>;

    // Default namespace (default: 'common')
    defaultNamespace?: string;

    // Pre-mark namespaces as loaded from SSR
    ssrLoadedNamespaces?: Record<string, string[]>;

    // Hook called when locale changes - return new translations
    onLocaleChange?: (newLocale: string, oldLocale: string) => Promise<Schema | void>;
}
```

### Instance Methods

```typescript
// Load a namespace for current locale
await loadNamespace('dashboard');

// Load namespace for specific locale
await loadNamespace('dashboard', 'pl');

// Check if namespace is loaded (reactive)
if (isNamespaceLoaded('dashboard')) { ... }

// Check if ANY namespace is loading (reactive)
if (isLoadingNamespace) { ... }

// Get available namespaces
const namespaces = getAvailableNamespaces();

// Mark namespaces as SSR-loaded (for SvelteKit per-page loading)
addSsrLoadedNamespaces('en', ['common', 'admin']);
```

## Best Practices

1. **Always load `common` first** - Shared UI elements need it
2. **Use SSR namespace tracking** - Prevents unnecessary re-fetching
3. **Pre-load on hover/focus** - Reduces perceived latency
4. **Group related keys** - Keep namespace files focused
5. **Don't over-split** - 3-5 namespaces is usually enough

## Troubleshooting

### Namespace loads but translations not appearing

Ensure the namespace keys are merged correctly. The library uses deep merge, so nested keys work:

```json
// common.json
{ "nav": { "home": "Home" } }

// dashboard.json
{ "nav": { "stats": "Stats" }, "dashboard": { "title": "Dashboard" } }

// Result after loading both:
{ "nav": { "home": "Home", "stats": "Stats" }, "dashboard": { "title": "Dashboard" } }
```

### `isNamespaceLoaded` returns false after SSR

Make sure you're passing `ssrLoadedNamespaces` to the config:

```typescript
setI18n({
    ssrLoadedTranslations: { [locale]: translations },
    ssrLoadedNamespaces: { [locale]: ['common', 'dashboard'] } // Don't forget this!
});
```

### Namespace loads multiple times

The library deduplicates concurrent loads. If you're seeing multiple loads, check that you're not creating multiple i18n instances.
