# i18n-svelte-runes-lite

> **Lightweight, type-safe internationalization for Svelte 5 with Runes**

## Features

✅ **Zero Dependencies** - Pure TypeScript + Svelte 5
✅ **Type Safety** - Full TypeScript autocomplete for translation keys
✅ **Svelte 5 Native** - Built with `$state` and `$derived` runes
✅ **SSR Compatible** - Context API support for SvelteKit
✅ **Magic Hook** - One-line setup for secure locale persistence
✅ **Multi-Environment** - Works in SvelteKit, Wails, and SPAs
✅ **Lazy Loading** - Load translations on-demand
✅ **Namespace Support** - Split translations by feature/route
✅ **Intl Integration** - Uses native `Intl` APIs
✅ **Small Bundle** - < 3KB gzipped

## Quick Start

### For Wails / SPA (Singleton Pattern)

```typescript
// src/lib/i18n/index.svelte.ts
import { createI18n } from 'i18n-svelte-runes-lite';
import en from './locales/en.json';
import pl from './locales/pl.json';

const i18n = createI18n<typeof en>({
    translations: { en, pl },
    initialLocale: 'en'
});

export const t = i18n.t;
export const setLocale = i18n.setLocale;
```

```svelte
<!-- App.svelte -->
<script>
    import { t, setLocale } from '$lib/i18n';
</script>

<h1>{t('welcome.title')}</h1>
<button onclick={() => setLocale('pl')}>Polski</button>
```

### For SvelteKit SSR (Context Pattern)

```svelte
<!-- +layout.svelte -->
<script>
    import { setI18n } from 'i18n-svelte-runes-lite/context';

    setI18n<typeof en>({
        translations: { en, pl },
        initialLocale: 'en'
    });
</script>

<slot />
```

```svelte
<!-- +page.svelte -->
<script>
    import { useI18n } from 'i18n-svelte-runes-lite/context';
    const { t, setLocale } = useI18n<typeof en>();
</script>

<h1>{t('welcome.title')}</h1>
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Migration Guide](./examples/MIGRATION.md) | Migrate from Svelte 4 or other i18n libraries |
| [Magic Hook (Recommended)](./examples/MAGIC_HOOK.md) | One-line setup with automatic persistence |
| [Singleton (Wails/SPA)](./examples/SINGLETON.md) | Use in desktop apps and SPAs |
| [SvelteKit SSR](./examples/SVELTEKIT.md) | Use with server-side rendering |
| [SvelteKit Complete](./examples/SVELTEKIT_COMPLETE.md) | Full setup guide with zero flash |
| [Namespaces](./examples/NAMESPACES.md) | Split translations by feature/route |
| [Lazy Loading](./examples/LAZY_LOADING.md) | Load translations on-demand |

## API Reference

### `createI18n(config)`

Creates a new i18n instance.

```typescript
const i18n = createI18n<Schema>({
    translations?: Record<string, Schema>,    // Eager load all
    loaders?: Record<string, () => Promise>,  // Lazy load on demand
    initialLocale?: string,
    fallbackLocale?: string,

    // Persistence options
    strategy?: 'auto' | 'bridge' | 'cookie' | 'localStorage' | 'none',
    persistenceEndpoint?: string,  // Default: '/__i18n/save'
    reloadOnChange?: boolean,      // Reload after bridge persistence
    environment?: 'auto' | 'sveltekit' | 'wails' | 'spa',

    // Namespace options (for splitting by feature)
    namespaceLoaders?: Record<string, NamespaceLoaders>,
    defaultNamespace?: string,              // Default: 'common'
    ssrLoadedNamespaces?: Record<string, string[]>  // SSR hydration fix
});
```

### `createI18nHook(options)` (Server)

Creates a SvelteKit server hook for automatic locale persistence.

```typescript
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

const i18nHook = createI18nHook({
    fallbackLocale?: string,           // Default: 'en'
    supportedLocales?: string[],       // For validation
    cookieName?: string,               // Default: 'locale'
    endpoint?: string,                 // Default: '/__i18n/save'
    cookieMaxAge?: number,             // Default: 31536000 (1 year)
});

export const handle = i18nHook;
```

### Instance Methods

```typescript
// Reactive state
i18n.locale              // Current locale (getter)
i18n.isLoadingLocale     // Loading state for current locale (getter)
i18n.isLoadingNamespace  // Loading state for any namespace (getter)

// Actions
await i18n.setLocale('pl');           // Switch locale
await i18n.loadLocale('pl');          // Pre-load locale

// Namespace loading
await i18n.loadNamespace('dashboard');           // Load namespace
await i18n.loadNamespace('dashboard', 'pl');     // Load for specific locale
i18n.isNamespaceLoaded('dashboard');             // Check if loaded
i18n.getAvailableNamespaces();                   // List available namespaces
i18n.addSsrLoadedNamespaces('en', ['common', 'admin']);  // Mark SSR-loaded

// Translation
i18n.t('key.path', { param: 'value' }); // Translate with params

// Formatting
i18n.fmt.number(1234.56);
i18n.fmt.currency(99.99);
i18n.fmt.date(new Date());

// Utilities
i18n.supportedLocales;        // Array of available locales
i18n.isLocaleSupported('pl'); // Check if locale exists
```

## Type Safety

Translation keys are **automatically typed** from your JSON schema:

```typescript
// locales/en.json
{
    "nav": {
        "dashboard": "Dashboard",
        "settings": "Settings"
    }
}

// In your code:
t('nav.dashboard');      // ✅ Autocomplete
t('nav.missing');        // ❌ TypeScript error
```

## Pluralization

```typescript
// locales/en.json
{
    "items": {
        "zero": "No items",
        "one": "{{count}} item",
        "other": "{{count}} items"
    }
}

// In your code:
t('items', { count: 0 }); // "No items"
t('items', { count: 1 }); // "1 item"
t('items', { count: 5 }); // "5 items"
```

## Lazy Loading

Load translations on-demand to reduce bundle size:

```typescript
const i18n = createI18n<Schema>({
    translations: { en },              // Load default only
    loaders: {                          // Load others on demand
        pl: () => import('./locales/pl.json'),
        de: () => import('./locales/de.json'),
        fr: () => import('./locales/fr.json')
    },
    initialLocale: 'en'
});

// Automatically loads when switching
await i18n.setLocale('pl');
```

## Project Setup CLI

Automatically set up i18n in your Svelte/SvelteKit project:

```bash
npx i18n-runes init
```

The CLI will:
- Detect your project type (SvelteKit, Wails/Desktop, or SPA)
- Ask for your supported languages
- Generate locale files with sample translations
- Create the i18n configuration file
- Update your Vite config if needed

### Non-Interactive Mode

For CI/CD or scripts, use:

```bash
I18N_YES=1 npx i18n-runes init
```

This uses defaults: English only, `src/lib/i18n/locales` path.

## Trans Component

For simple translations with interpolation:

```svelte
<script>
    import Trans from 'i18n-svelte-runes-lite/Trans.svelte';
    import { t } from '$lib/i18n';

    let count = $state(0);
</script>

<!-- Option 1: Spread props (convenient) -->
<Trans key="items.count" {t} count={count} />

<!-- Option 2: Explicit params object (better type safety) -->
<Trans key="items.count" {t} params={{ count }} />

<button onclick={() => count++}>Add item</button>
```

## TransRich Component

For translations with components or rich formatting:

```svelte
<script>
    import { TransRich } from 'i18n-svelte-runes-lite';
    import { t } from '$lib/i18n';
</script>

<!-- JSON: "terms": "Accept our <link>terms</link> and <bold>privacy policy</bold>" -->
<TransRich key="terms" {t}>
    {#snippet link(content)}
        <a href="/terms">{content}</a>
    {/snippet}
    {#snippet bold(content)}
        <strong>{content}</strong>
    {/snippet}
</TransRich>

<!-- Auto-rendered safe HTML tags (no snippet needed) -->
<!-- JSON: "info": "This is <b>important</b> and <em>urgent</em>" -->
<TransRich key="info" {t} />
```

## Translation CLI

Automatically translate missing keys using OpenAI or any compatible LLM API.

### Setup

Add to your `package.json`:

```json
{
  "scripts": {
    "i18n:translate": "i18n-translate",
    "i18n:translate:dry": "i18n-translate --dry-run"
  },
  "i18n": {
    "localesDir": "src/lib/i18n/locales",
    "sourceLang": "en"
  }
}
```

### Usage

Add your API key to `.env` (automatically loaded):
```bash
OPENAI_API_KEY=sk-xxx
```

Then run:
```bash
# Preview what would be translated (no API call)
npm run i18n:translate:dry

# Translate missing keys
npm run i18n:translate
```

**Using local LLM (Ollama):**
```bash
# In .env
OPENAI_BASE_URL=http://localhost:11434/v1/chat/completions
OPENAI_MODEL=llama3.2
OPENAI_API_KEY=ollama
```

### Configuration Options

**Via `package.json` "i18n" field:**
```json
{
  "i18n": {
    "localesDir": "src/lib/i18n/locales",
    "sourceLang": "en",
    "batchSize": 20
  }
}
```

**Or via `i18n.config.json`:**
```json
{
  "localesDir": "src/lib/i18n/locales",
  "sourceLang": "en",
  "batchSize": 20,
  "api": {
    "url": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini"
  }
}
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--locales, -l <path>` | Path to locales directory |
| `--source, -s <lang>` | Source language (default: en) |
| `--target, -t <lang>` | Translate only this language |
| `--dry-run, -d` | Preview without making changes |
| `--verbose, -v` | Show detailed output |
| `--no-backup` | Skip creating .bak files |

## License

MIT
