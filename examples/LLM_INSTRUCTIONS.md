# i18n-svelte-runes-lite - LLM Integration Guide

Quick reference for AI agents integrating this i18n library into SvelteKit projects.

## CRITICAL: Vite Config Required

**Without this, the package will fail with esbuild errors.**

```typescript
// vite.config.ts - ADD THESE OPTIONS
{
  optimizeDeps: {
    exclude: ['i18n-svelte-runes-lite']
  },
  ssr: {
    noExternal: ['i18n-svelte-runes-lite']
  }
}
```

---

## Minimal Setup (5 files)

### 1. `src/lib/i18n/locales/en.json`
```json
{
  "hello": "Hello, {{name}}!",
  "items": { "zero": "No items", "one": "{{count}} item", "other": "{{count}} items" }
}
```

### 2. `src/lib/i18n/locales.ts`
```typescript
import type en from './locales/en.json';
export type Schema = typeof en;
import enJSON from './locales/en.json';
import plJSON from './locales/pl.json';
export const translations = { en: enJSON, pl: plJSON };
```

### 3. `src/app.d.ts`
```typescript
declare global {
  namespace App {
    interface Locals { locale: string; }
  }
}
export {};
```

### 4. `src/hooks.server.ts`
```typescript
import type { Handle } from '@sveltejs/kit';
export const handle: Handle = async ({ event, resolve }) => {
  const locale = event.cookies.get('locale') || 'en';
  event.locals.locale = locale;
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%sveltekit.html.attributes%', `lang="${locale}"`)
  });
};
```

### 5. `src/routes/+layout.server.ts`
```typescript
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals }) => ({ locale: locals.locale });
```

### 6. `src/routes/+layout.svelte`
```svelte
<script lang="ts">
  import { setI18n } from 'i18n-svelte-runes-lite/context';
  import { translations, type Schema } from '$lib/i18n/locales';
  import { browser } from '$app/environment';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  const i18n = setI18n<Schema>({
    translations,
    initialLocale: data.locale,
    fallbackLocale: 'en'
  });

  $effect(() => {
    if (browser) document.cookie = `locale=${i18n.locale};path=/;max-age=31536000;SameSite=Lax`;
  });
</script>

{@render children()}
```

---

## Usage in Components

```svelte
<script lang="ts">
  import { useI18n } from 'i18n-svelte-runes-lite/context';
  import type { Schema } from '$lib/i18n/locales';

  const i18n = useI18n<Schema>();
  const { t, setLocale, fmt } = i18n;
</script>

<!-- Basic -->
{t('hello', { name: 'World' })}

<!-- Pluralization -->
{t('items', { count: 5 })}

<!-- Switch locale -->
<button onclick={() => setLocale('pl')}>Polski</button>

<!-- Current locale (reactive) -->
{i18n.locale}

<!-- Formatting -->
{fmt.number(1234.56)}
{fmt.currency(99.99)}
{fmt.date(new Date())}
```

---

## JSON Translation Format

```json
{
  "simple": "Hello",
  "interpolation": "Hello, {{name}}!",
  "plural": {
    "zero": "No items",
    "one": "{{count}} item",
    "few": "{{count}} items",
    "other": "{{count}} items"
  },
  "nested": {
    "deep": {
      "key": "Value"
    }
  }
}
```

Access nested: `t('nested.deep.key')`

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Unexpected token` on start | Add Vite config (optimizeDeps.exclude, ssr.noExternal) |
| Flash of wrong language | Use cookies, not localStorage. Need hooks.server.ts + layout.server.ts |
| `Cannot find module` | Check import path: `'i18n-svelte-runes-lite/context'` (no .svelte) |
| `data.locale` undefined | Missing +layout.server.ts |
| Locale not reactive | Access via `i18n.locale`, don't destructure |

---

## File Checklist

When setting up, ensure these files exist:

- [ ] `vite.config.ts` - has optimizeDeps.exclude and ssr.noExternal
- [ ] `src/app.d.ts` - has Locals.locale type
- [ ] `src/hooks.server.ts` - reads cookie, sets html lang
- [ ] `src/routes/+layout.server.ts` - passes locale to client
- [ ] `src/routes/+layout.svelte` - setI18n with data.locale, $effect for cookie
- [ ] `src/lib/i18n/locales.ts` - Schema type and translations export
- [ ] `src/lib/i18n/locales/*.json` - translation files

---

# Full API Reference

## Package Exports

```typescript
// Main export
import { createI18n, TransRich, parseComponentSlots, hasComponentSlots } from 'i18n-svelte-runes-lite';

// Context API (SvelteKit SSR)
import { setI18n, useI18n, getLocale, getLocaleGetter, getTranslator, getLangForSSR } from 'i18n-svelte-runes-lite/context';

// Server Hook (SvelteKit)
import { createI18nHook, getLocaleFromLocals } from 'i18n-svelte-runes-lite/server';

// Shared Config
import { createSharedConfig, validateStorageKey, VALID_STORAGE_KEY_PATTERN, MAX_STORAGE_KEY_LENGTH } from 'i18n-svelte-runes-lite/config';

// Types
import type { I18nConfig, I18nConfigWithNamespaces, TranslationPaths, InterpolationParams, NamespaceLoaders, I18nParams, PersistenceStrategy, EnvironmentType, SharedI18nConfig } from 'i18n-svelte-runes-lite/types';

// Core utilities
import { escapeHtml, getNestedValue, getPluralSuffix, formatters, formatValue, translateInternal } from 'i18n-svelte-runes-lite/core';

// Components
import Trans from 'i18n-svelte-runes-lite/Trans.svelte';
import TransRich from 'i18n-svelte-runes-lite/TransRich.svelte';
```

---

## 1. createI18n<Schema>(config)

Main function to create an i18n instance.

### Defining the Schema Type

```typescript
// Standard way to define Schema - infer from source locale JSON
import type en from './locales/en.json';
type Schema = typeof en;
```

### Config Options (I18nConfig<Schema>)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shared` | `SharedI18nConfig` | - | Shared config for server/client consistency |
| `translations` | `Record<string, Schema>` | `{}` | Eagerly loaded translations |
| `loaders` | `Record<string, () => Promise<Schema>>` | `{}` | Lazy loaders for translations |
| `initialLocale` | `string` | auto-detect | Initial locale to use |
| `fallbackLocale` | `string` | `'en'` | Fallback when translation missing |
| `debug` | `boolean` | `false` | Show keys instead of translations |
| `onMissingKey` | `(key: string, locale: string) => void` | console.warn | Custom missing key handler |
| `strictSSR` | `boolean` | `false` | Throw if initialLocale not provided |
| `ssrLoadedTranslations` | `Record<string, Schema>` | - | Pre-loaded translations from SSR |
| `strategy` | `PersistenceStrategy` | `'auto'` | Locale persistence strategy |
| `persistenceEndpoint` | `string` | `'/__i18n/save'` | Endpoint for bridge strategy |
| `reloadOnChange` | `boolean` | `false` | Reload page after persistence |
| `environment` | `EnvironmentType` | `'auto'` | Override environment detection |
| `storageKey` | `string` | `'locale'` | Key for localStorage/cookie |

### Namespace Extensions (I18nConfigWithNamespaces<Schema>)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespaceLoaders` | `Record<string, NamespaceLoaders>` | - | Namespace loaders per locale |
| `defaultNamespace` | `string` | `'common'` | Default namespace name |
| `ssrLoadedNamespaces` | `Record<string, string[]>` | - | Mark SSR-loaded namespaces |

### Types

```typescript
type PersistenceStrategy = 'cookie' | 'localStorage' | 'bridge' | 'auto' | 'none';
type EnvironmentType = 'sveltekit' | 'wails' | 'spa' | 'auto';

interface NamespaceLoaders {
    [namespace: string]: () => Promise<any>;
}
```

### Returned Instance

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `locale` | `string` (getter) | Current locale (reactive) |
| `isLoadingLocale` | `boolean` (getter) | True if current locale is loading |
| `isAnyLocaleLoading` | `boolean` (getter) | True if any locale is loading |
| `isLoadingNamespace` | `boolean` (getter) | True if any namespace is loading |
| `supportedLocales` | `string[]` | Array of available locales |
| `debug` | `boolean` (getter) | Current debug mode state |
| `t(key, params?)` | `string` | Translate a key |
| `fmt.number(n, opt?)` | `string` | Format number |
| `fmt.currency(n, cur?)` | `string` | Format currency (default: USD) |
| `fmt.date(d, opt?)` | `string` | Format date |
| `fmt.list(items, opt?)` | `string` | Format list |
| `setLocale(locale, lazyLoad?)` | `Promise<void>` | Switch locale |
| `loadLocale(locale)` | `Promise<void>` | Pre-load locale translations |
| `loadNamespace(ns, locale?)` | `Promise<void>` | Load namespace |
| `isLocaleSupported(locale)` | `boolean` | Check if locale exists |
| `isNamespaceLoaded(ns, locale?)` | `boolean` | Check if namespace loaded |
| `getAvailableNamespaces(locale?)` | `string[]` | List available namespaces |
| `addSsrLoadedNamespaces(locale, ns[])` | `void` | Mark namespaces as SSR-loaded |
| `setDebug(enabled)` | `void` | Enable/disable debug mode |
| `getLangForSSR()` | `string` | Get locale for SSR lang attr |

---

## 2. Context API (SvelteKit SSR)

### setI18n<Schema>(config)

Sets up i18n context in root layout. Returns the i18n instance.

```svelte
<!-- +layout.svelte -->
<script>
    import { setI18n } from 'i18n-svelte-runes-lite/context';

    const i18n = setI18n<Schema>({
        translations: { en, pl },
        initialLocale: data.locale
    });
</script>
```

### useI18n<Schema>()

Gets the i18n instance from context. Must be called within component tree where setI18n was used.

```svelte
<script>
    import { useI18n } from 'i18n-svelte-runes-lite/context';

    const i18n = useI18n<Schema>();
    const { t, setLocale } = i18n;
</script>

<!-- Access locale through object for reactivity -->
<p>Current: {i18n.locale}</p>
```

### Reactivity Note (Svelte 5)

When using `t()` or `locale` inside `<script>`, wrap in `$derived` to keep them reactive:

```svelte
<script>
    const i18n = useI18n<Schema>();
    const { t } = i18n;

    // ❌ Not reactive - won't update on locale change
    let greeting = t('hello');

    // ✅ Reactive - updates when locale changes
    let greeting = $derived(t('hello'));
    let currentLocale = $derived(i18n.locale);
</script>
```

### Other Context Exports

| Function | Return Type | Description |
|----------|-------------|-------------|
| `getLocale()` | `string` | Get current locale (one-time, deprecated) |
| `getLocaleGetter()` | `() => string` | Get reactive locale getter function |
| `getTranslator()` | `t function` | Get the t() function from context |
| `getLangForSSR()` | `string` | Get locale for SSR (one-time) |

### Type

```typescript
type I18nInstance<Schema> = ReturnType<typeof createI18n<Schema>>;
```

---

## 3. Server Hook (SvelteKit)

### createI18nHook(options)

Creates a SvelteKit server hook for locale management.

### HookOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shared` | `SharedI18nConfig` | - | Shared config for consistency |
| `fallbackLocale` | `string` | `'en'` | Default locale |
| `supportedLocales` | `string[]` | - | List for validation |
| `storageKey` | `string` | `'locale'` | Cookie name |
| `cookieName` | `string` | `'locale'` | **Deprecated**, use `storageKey` |
| `endpoint` | `string` | `'/__i18n/save'` | Bridge endpoint path |
| `cookieMaxAge` | `number` | `31536000` | Cookie max age in seconds (1 year) |
| `cookiePath` | `string` | `'/'` | Cookie path |
| `cookieSameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | Cookie SameSite attribute |
| `cookieSecure` | `boolean` | auto-detect | Require HTTPS |

### Usage

```typescript
// src/hooks.server.ts
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

export const handle = createI18nHook({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl', 'de']
});

// With sequence
import { sequence } from '@sveltejs/kit/hooks';
export const handle = sequence(i18nHook, otherHook);
```

### getLocaleFromLocals(locals, fallback?)

Helper to get locale from event.locals.

```typescript
import { getLocaleFromLocals } from 'i18n-svelte-runes-lite/server';

// In +layout.server.ts
export const load = async ({ locals }) => {
    return { locale: getLocaleFromLocals(locals, 'en') };
};
```

### Types

```typescript
interface I18nLocals {
    locale: string;
}
```

---

## 4. Shared Config

### createSharedConfig(config)

Creates a validated, frozen shared configuration object.

### SharedI18nConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fallbackLocale` | `string` | `'en'` | **Required**. Default locale |
| `supportedLocales` | `string[]` | - | List of supported locales |
| `storageKey` | `string` | `'locale'` | Key for localStorage/cookie |
| `endpoint` | `string` | `'/__i18n/save'` | Bridge endpoint path |
| `warnOnAutoFix` | `boolean` | `true` | Show auto-fix warnings |
| `cookieMaxAge` | `number` | `31536000` | Cookie max age (1 year) |
| `cookiePath` | `string` | `'/'` | Cookie path |
| `cookieSameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | SameSite attribute |
| `cookieSecure` | `boolean` | auto-detect | Require HTTPS |

### Usage

```typescript
// src/lib/i18n/config.ts
import { createSharedConfig } from 'i18n-svelte-runes-lite/config';

export const sharedConfig = createSharedConfig({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl', 'de'],
    storageKey: 'app-locale'
});

// Use in both server and client
createI18nHook({ shared: sharedConfig });
createI18n({ shared: sharedConfig, translations, initialLocale });
```

### Validation Helpers

```typescript
validateStorageKey(key: string, context?: string): void  // Throws if invalid

const VALID_STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const MAX_STORAGE_KEY_LENGTH = 64;
```

---

## 5. Components

### Trans.svelte

Simple translation component for plain text.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | Yes | Translation key |
| `t` | `function` | Yes | Translation function from createI18n |
| `params` | `Record<string, string \| number \| Date>` | No | Explicit params object |
| `as` | `keyof HTMLElementTagNameMap` | No | Wrapper element (default: 'span') |
| `class` | `string` | No | CSS class |
| `style` | `string` | No | Inline styles |
| `id` | `string` | No | HTML id |
| `title` | `string` | No | HTML title |
| `lang` | `string` | No | HTML lang |
| `dir` | `string` | No | HTML dir |
| `role` | `string` | No | ARIA role |
| `aria-label` | `string` | No | ARIA label |
| `aria-hidden` | `string` | No | ARIA hidden |
| `aria-describedby` | `string` | No | ARIA describedby |
| `[key: string]` | `unknown` | No | Additional interpolation params |

#### Usage

```svelte
<!-- Spread props -->
<Trans key="items.count" {t} count={5} />

<!-- Explicit params -->
<Trans key="welcome" {t} params={{ name: 'John' }} />

<!-- Custom wrapper -->
<Trans key="title" {t} as="h1" class="text-xl" />
```

### TransRich.svelte

Component for translations with rich content (components, HTML).

#### Props

Same as Trans.svelte, plus:
- Accepts Svelte 5 snippets as children for component interpolation
- Snippets receive `(content: string, attributes?: Record<string, string>)`

#### Auto-rendered Safe HTML Tags

These tags render automatically without snippets:
`b`, `strong`, `i`, `em`, `u`, `s`, `mark`, `small`, `sub`, `sup`, `span`

#### Safe Attributes (for auto-rendered tags)

Only these attributes are allowed: `class`, `title`, `lang`, `dir`

#### Usage

```svelte
<!-- JSON: "terms": "Accept <link>terms</link> and <button>continue</button>" -->
<TransRich key="terms" {t}>
    {#snippet link(content)}
        <a href="/terms">{content}</a>
    {/snippet}
    {#snippet button(content)}
        <Button>{content}</Button>
    {/snippet}
</TransRich>

<!-- With attributes from translation -->
<!-- JSON: "tos": "Read our <link href='/tos'>Terms</link>" -->
<TransRich key="tos" {t}>
    {#snippet link(content, attrs)}
        <a href={attrs?.href ?? '/fallback'}>{content}</a>
    {/snippet}
</TransRich>

<!-- Auto-rendered safe tags (no snippet needed) -->
<!-- JSON: "info": "This is <b>important</b> and <em>urgent</em>" -->
<TransRich key="info" {t} />
```

#### Utility Function Blocklist

These function names are blocked from being treated as snippets:
`format`, `formatter`, `transform`, `convert`, `parse`, `stringify`, `encode`, `decode`, `serialize`, `deserialize`, `normalize`, `validate`, `filter`, `sanitize`, `escape`, `clean`, `callback`, `handler`, `fn`, `func`, `action`, `dispatch`, `onChange`, `onUpdate`, `onSubmit`, `onLoad`, `onError`, `map`, `reduce`, `sort`, `find`, `each`, `forEach`, `helper`, `util`, `utils`, `render`, `compute`, `calculate`, `get`, `set`, `fetch`, `load`, `save`, `update`, `delete`

**Escape Hatch**: Use `snippet:` prefix to bypass blocklist:
```svelte
<TransRich key="test" {t} snippet:get={myGetSnippet} />
```

---

## 6. Core Utilities

### Formatters

```typescript
formatters.number(num: number, locale: string, options?: Intl.NumberFormatOptions): string
formatters.currency(num: number, locale: string, currency?: string): string  // default: 'USD'
formatters.date(date: Date | number | string, locale: string, options?: Intl.DateTimeFormatOptions): string
formatters.list(items: string[], locale: string, options?: Intl.ListFormatOptions): string
```

### Helper Functions

```typescript
escapeHtml(unsafe: unknown): string
getNestedValue(obj: Record<string, unknown>, path: string): unknown
getPluralSuffix(locale: string, count: number): string  // 'one', 'two', 'few', 'many', 'other'
formatValue(value: unknown, format: string, formatArg: string | undefined, locale: string): string
translateInternal(locale, fallbackLocale, translations, key, params?, onMissingKey?): string
```

### parseComponentSlots

```typescript
interface SlotNode {
    type: 'text' | 'slot';
    content?: string;        // For 'text' nodes
    name?: string;           // For 'slot' nodes (lowercased)
    slotContent?: string;    // Inner content
    attributes?: Record<string, string>;  // Parsed attributes
}

parseComponentSlots(template: string): SlotNode[]
hasComponentSlots(template: string): boolean
```

---

## 7. Translation String Syntax

### Interpolation

```
"greeting": "Hello {{name}}!"
"welcome": "Hello {{ name }}!"           // Whitespace OK
"nested": "Hello {{user.firstName}}!"    // Dot notation
"hyphen": "ID: {{user-id}}"              // Hyphenated keys
```

### Formatting

```
"price": "Cost: {{amount, currency}}"        // Uses USD
"price": "Cost: {{amount, currency, EUR}}"   // Specify currency
"date": "Today: {{date, date}}"
"count": "Items: {{count, number}}"
```

### Pluralization

```json
{
    "items": {
        "zero": "No items",
        "one": "{{count}} item",
        "two": "{{count}} items",
        "few": "{{count}} items",
        "many": "{{count}} items",
        "other": "{{count}} items"
    }
}
```

Usage: `t('items', { count: 5 })`

### Component Slots (TransRich)

```json
{
    "terms": "Accept our <link>terms</link> and <bold>privacy policy</bold>",
    "tos": "Read <link href='/tos' class='underline'>Terms of Service</link>"
}
```

---

## 8. CLI Tools

### i18n-translate

Automatically translate missing keys using LLM API.

```bash
# Preview
npx i18n-translate --dry-run

# Translate
npx i18n-translate
```

#### CLI Options

| Option | Description |
|--------|-------------|
| `--locales, -l <path>` | Path to locales directory |
| `--source, -s <lang>` | Source language (default: en) |
| `--target, -t <lang>` | Translate only this language |
| `--dry-run, -d` | Preview without making changes |
| `--verbose, -v` | Show detailed output |
| `--no-backup` | Skip creating .bak files |

#### Configuration

**package.json:**
```json
{
  "i18n": {
    "localesDir": "src/lib/i18n/locales",
    "sourceLang": "en",
    "batchSize": 20
  }
}
```

**i18n.config.json:**
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

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=http://localhost:11434/v1/chat/completions  # For Ollama
OPENAI_MODEL=llama3.2
```

### i18n-runes

CLI for project setup and configuration.

```bash
npx i18n-runes init
```

---

## 9. Type Utilities

### TranslationPaths<T>

Generates all possible dot-notation paths from a schema type.

```typescript
type Schema = { nav: { dashboard: string } };
type Paths = TranslationPaths<Schema>;  // "nav" | "nav.dashboard"
```

### I18nParams<Schema, Key>

Extracts required parameters from a translation key.

```typescript
// Schema: { welcome: "Hello {{name}}!" }
type Params = I18nParams<Schema, "welcome">;  // { name: string | number | Date }

// Schema: { simple: "No params" }
type Params = I18nParams<Schema, "simple">;  // void
```

---

## 10. Security Notes

### XSS Prevention
- `Trans`: Svelte auto-escapes `{content}`
- `TransRich`: Content is escaped, only safe HTML tags auto-render
- Safe attributes whitelist: `class`, `title`, `lang`, `dir`
- `style` attribute blocked (CSS exfiltration risk)
- Event handlers (`onclick`, etc.) blocked

### URL Validation (TransRich attributes)
Whitelist approach - only these protocols allowed:
- `http:`, `https:`, `mailto:`, `tel:`
- Relative URLs (`/path`, `#anchor`, `./relative`)

### Prototype Pollution Prevention
These keys are blocked in translations and params:
- `__proto__`, `constructor`, `prototype`

### ReDoS Protection
- Template max length: 10,000 characters
- Parse cache: 100 entries max
- Formatter cache: 50 entries per type

---

## 11. Environment Detection

Auto-detection order:
1. **Wails**: `window.runtime` or `window.Wails`
2. **Tauri**: `window.__TAURI__`
3. **Electron**: `window.electronAPI` or `window.process.versions.electron`
4. **SvelteKit**: `__sveltekit_dev`, `__sveltekit_app`, `/_app/` scripts
5. **SPA**: Default for browser without framework indicators

Persistence strategy by environment:
- **SvelteKit**: `bridge` (HttpOnly cookie via server endpoint)
- **Wails/Tauri/Electron**: `localStorage`
- **SPA**: `cookie` (client-side)

---

## 12. SSR Hydration

### Critical Pattern

```svelte
<!-- +layout.svelte -->
<script>
    import { setI18n } from 'i18n-svelte-runes-lite/context';

    let { data } = $props();

    setI18n({
        translations: { en },
        loaders: { pl: () => import('./locales/pl.json') },
        initialLocale: data.locale,  // CRITICAL: From server
        ssrLoadedTranslations: { [data.locale]: data.translations }
    });
</script>
```

### Server Setup

```typescript
// hooks.server.ts
import { createI18nHook } from 'i18n-svelte-runes-lite/server';

export const handle = createI18nHook({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl']
});

// +layout.server.ts
export const load = async ({ locals }) => {
    return { locale: locals.locale };
};
```

### app.html

```html
<!DOCTYPE html>
<html lang="%lang%">
```

The hook automatically replaces `%lang%` or updates existing `lang` attribute.
