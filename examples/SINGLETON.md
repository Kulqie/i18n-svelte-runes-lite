# Singleton Usage Guide (Wails/SPA)

This guide shows how to use `i18n-svelte-runes-lite` with the **singleton pattern** for Wails apps or SPAs.

## When to Use Singleton Pattern?

✅ **Use singleton for:**
- Wails desktop apps (single-user environment)
- Pure SPAs (no SSR)
- Simple apps with < 5 languages

❌ **DON'T use for:**
- SvelteKit with SSR (use Context API instead - see SVELTEKIT.md)

## Quick Setup

### Step 1: Create i18n Instance

Create `src/lib/i18n/index.svelte.ts`:

```typescript
// src/lib/i18n/index.svelte.ts
import { createI18n } from '$lib/i18n-svelte-runes-lite';
import type enJSON from './locales/en.json';

// Import translations
import en from './locales/en.json';
import pl from './locales/pl.json';

type Schema = typeof enJSON;

// Initialize with all translations
// ✨ New: Automatic persistence via localStorage for Wails apps!
const i18n = createI18n<Schema>({
    translations: { en, pl },
    initialLocale: 'en',
    fallbackLocale: 'en'
    // strategy: 'auto' auto-detects Wails and uses localStorage
});

// Export functions (safe to export directly)
export const t = i18n.t;
export const setLocale = i18n.setLocale;
export const fmt = i18n.fmt;
export const loadLocale = i18n.loadLocale;

// ⚠️ IMPORTANT: Do NOT export locale or isLoadingLocale as const!
// These are getters that return primitive values. Exporting them captures
// the value once at module load time, breaking reactivity.
//
// ❌ WRONG: export const locale = i18n.locale;  // Captured once, never updates!
// ✅ CORRECT: Export the i18n object and access locale through it

// Export instance - use i18n.locale and i18n.isLoadingLocale for reactivity
export default i18n;
```

> **Automatic Persistence:** With `strategy: 'auto'` (default), the library detects Wails environment and automatically persists locale to `localStorage`. No manual setup needed!

### Step 2: Create Public API

Create `src/lib/i18n/index.ts`:

```typescript
// src/lib/i18n/index.ts
// Re-export everything for easy importing
export * from './index.svelte';
```

### Step 3: Use in Components

```svelte
<!-- src/App.svelte or any component -->
<script>
    import i18n, { t, setLocale, fmt } from '$lib/i18n';
</script>

<h1>{t('welcome.title')}</h1>
<p>{t('welcome.subtitle', { name: 'World' })}</p>

<button onclick={() => setLocale('en')}>English</button>
<button onclick={() => setLocale('pl')}>Polski</button>

<p>Price: {fmt.currency(123.45)}</p>
<!-- Access locale through i18n object for reactivity -->
<p>Current locale: {i18n.locale}</p>
```

## Lazy Loading (Optional)

Even with singleton pattern, you can lazy load languages:

```typescript
// src/lib/i18n/index.svelte.ts
const i18n = createI18n<Schema>({
    translations: { en }, // Only load default
    loaders: {           // Lazy load others
        pl: () => import('./locales/pl.json'),
        de: () => import('./locales/de.json'),
        fr: () => import('./locales/fr.json')
    },
    initialLocale: 'en',
    fallbackLocale: 'en'
});

// Load locale on demand
async function switchToPolish() {
    await setLocale('pl'); // Automatically loads pl.json
}
```

## Wails-Specific Integration

### Automatic Persistence (Recommended)

With `strategy: 'auto'`, the library automatically:
1. Detects Wails via `window.runtime` or `window.Wails`
2. Uses `localStorage` for persistence
3. Reads persisted locale on startup

```typescript
const i18n = createI18n<Schema>({
    translations: { en, pl },
    initialLocale: 'en',
    fallbackLocale: 'en'
    // That's it! Persistence is automatic in Wails.
});
```

### Custom Persistence with Go Backend (Optional)

If you need to persist locale in Wails' Go backend instead of localStorage:

```typescript
// src/lib/i18n/index.svelte.ts
import { SaveLocale, LoadLocale } from '../../wailsjs/go/main/App';

async function getSavedLocale(): Promise<string> {
    try {
        return await LoadLocale() || 'en';
    } catch {
        return 'en';
    }
}

async function saveLocale(locale: string) {
    try {
        await SaveLocale(locale);
    } catch (error) {
        console.error('Failed to save locale:', error);
    }
}

const i18n = createI18n<Schema>({
    translations: { en, pl },
    initialLocale: await getSavedLocale(),
    fallbackLocale: 'en',
    strategy: 'none'  // Disable auto-persistence, we'll handle it
});

// Override setLocale to persist to Go backend
const originalSetLocale = i18n.setLocale;
i18n.setLocale = async (newLocale: string) => {
    await originalSetLocale(newLocale);
    await saveLocale(newLocale);
};
```

### Detect System Locale in Wails

```typescript
import { GetLocale } from '../../wailsjs/go/main/App';

const i18n = createI18n<Schema>({
    translations: { en, pl },
    initialLocale: await GetLocale() || 'en',
    fallbackLocale: 'en'
});
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

## Advanced Patterns

### Language Switcher Component

```svelte
<!-- src/components/LanguageSwitcher.svelte -->
<script>
    import i18n, { setLocale } from '$lib/i18n';

    const languages = [
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'pl', name: 'Polski', flag: '🇵🇱' }
    ];

    async function changeLocale(code: string) {
        await setLocale(code);
    }
</script>

<!-- Access locale through i18n object for reactivity -->
<select value={i18n.locale} onchange={(e) => changeLocale(e.target.value)}>
    {#each languages as lang}
        <option value={lang.code}>
            {lang.flag} {lang.name}
        </option>
    {/each}
</select>

{#if i18n.isLoadingLocale}
    <span class="loading">Loading...</span>
{/if}

<style>
    .loading {
        margin-left: 0.5rem;
        color: #666;
    }
</style>
```

### Format Numbers and Dates

```svelte
<script>
    import { fmt } from '$lib/i18n';

    const price = 1234.56;
    const date = new Date();
</script>

<p>Number: {fmt.number(price, { minimumFractionDigits: 2 })}</p>
<p>Currency: {fmt.currency(price)}</p>
<p>Date: {fmt.date(date, { dateStyle: 'full' })}</p>
```

### Auto-translate Document Title

```svelte
<!-- src/routes/+layout.svelte or src/App.svelte -->
<script>
    import i18n, { t } from '$lib/i18n';

    // Use $effect to update title when locale changes
    $effect(() => {
        // Reading i18n.locale creates a reactive dependency
        void i18n.locale;
        document.title = t('app.title');
    });
</script>

<slot />
```

## Comparison: Singleton vs Context API

| Feature | Singleton (this file) | Context API (SVELTEKIT.md) |
|---------|----------------------|----------------------------|
| **Best for** | Wails, SPA | SvelteKit SSR |
| **State isolation** | ❌ Global | ✅ Per-request |
| **Setup complexity** | ✅ Simple | ⚠️ Moderate |
| **Import style** | `import { t } from ...` | `const { t } = useI18n()` |
| **Server-side safe** | ❌ No | ✅ Yes |

## FAQ

**Q: Can I switch between singleton and context later?**
- Yes! The core library is the same
- Just change how you initialize and access the instance

**Q: How do I test with singleton?**
- The singleton persists across tests
- Use a fresh instance per test or reset state:

```typescript
// tests/setup.ts
import { createI18n } from '$lib/i18n';
let testI18n = createI18n({ translations: { en: {} } });
```

**Q: Should I use lazy loading in Wails?**
- Wails apps have all files locally, so eager loading is fast
- Lazy loading is only useful if you have 10+ languages
