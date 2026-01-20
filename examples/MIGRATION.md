# Migration Guide

This guide helps you migrate from other i18n libraries or from Svelte 4 to Svelte 5 with i18n-svelte-runes-lite.

## Table of Contents

- [From Svelte 4 to Svelte 5](#from-svelte-4-to-svelte-5)
- [From svelte-i18n](#from-svelte-i18n)
- [From typesafe-i18n](#from-typesafe-i18n)
- [From i18next/svelte-i18next](#from-i18nextsvelte-i18next)

---

## From Svelte 4 to Svelte 5

### Key Changes

| Svelte 4 | Svelte 5 (this library) |
|----------|------------------------|
| `$: locale` reactive statement | `$state()` rune (internal) |
| `$locale` store | `i18n.locale` getter |
| `on:click={handler}` | `onclick={handler}` |
| `export let prop` | `let { prop } = $props()` |

### Step 1: Update Component Syntax

**Before (Svelte 4):**
```svelte
<script>
  import { t, locale } from '$lib/i18n';

  export let data;

  $: currentLocale = $locale;
</script>

<button on:click={() => locale.set('pl')}>
  {$t('switch_language')}
</button>
```

**After (Svelte 5):**
```svelte
<script>
  import { useI18n } from 'i18n-svelte-runes-lite/context';

  let { data } = $props();

  const i18n = useI18n();
  const { t, setLocale } = i18n;

  // Access locale through i18n object for reactivity
  // let currentLocale = $derived(i18n.locale);
</script>

<button onclick={() => setLocale('pl')}>
  {t('switch_language')}
</button>
```

### Step 2: Update Store Access

**Before (Svelte 4 stores):**
```svelte
<script>
  import { locale } from '$lib/i18n';

  // Reactive access via $ prefix
  $: console.log('Locale:', $locale);
</script>

<p>Current: {$locale}</p>
```

**After (Svelte 5 runes):**
```svelte
<script>
  import { useI18n } from 'i18n-svelte-runes-lite/context';

  const i18n = useI18n();

  // Use $derived for reactive computations
  let message = $derived(`Locale is ${i18n.locale}`);
</script>

<!-- Access through object in template -->
<p>Current: {i18n.locale}</p>
```

### Step 3: Update Layout Setup

**Before (Svelte 4):**
```svelte
<!-- +layout.svelte -->
<script>
  import { init } from 'svelte-i18n';

  init({
    fallbackLocale: 'en',
    initialLocale: 'en'
  });
</script>

<slot />
```

**After (Svelte 5):**
```svelte
<!-- +layout.svelte -->
<script>
  import { setI18n } from 'i18n-svelte-runes-lite/context';
  import en from '$lib/i18n/locales/en.json';
  import pl from '$lib/i18n/locales/pl.json';

  let { data, children } = $props();

  setI18n({
    translations: { en, pl },
    initialLocale: data.locale,
    fallbackLocale: 'en'
  });
</script>

{@render children()}
```

---

## From svelte-i18n

### API Mapping

| svelte-i18n | i18n-svelte-runes-lite |
|-------------|------------------------|
| `$_('key')` | `t('key')` |
| `$locale` | `i18n.locale` |
| `locale.set('pl')` | `setLocale('pl')` |
| `$format.number()` | `i18n.fmt.number()` |
| `$format.date()` | `i18n.fmt.date()` |
| `addMessages()` | Pass to `translations` config |
| `init()` | `createI18n()` / `setI18n()` |

### Translation Syntax

**svelte-i18n:**
```json
{
  "greeting": "Hello {name}!",
  "items": "{count, plural, one {# item} other {# items}}"
}
```

**i18n-svelte-runes-lite:**
```json
{
  "greeting": "Hello {{name}}!",
  "items": {
    "one": "{{count}} item",
    "other": "{{count}} items"
  }
}
```

### Migration Script

```bash
# Convert {var} to {{var}} in JSON files
find src/lib/i18n/locales -name "*.json" -exec sed -i '' 's/{{\([^}]*\)}}/<<\1>>/g; s/{\([^}]*\)}/{{\1}}/g; s/<<\([^>]*\)>>/{\1}/g' {} \;
```

---

## From typesafe-i18n

### API Mapping

| typesafe-i18n | i18n-svelte-runes-lite |
|---------------|------------------------|
| `LL.key()` | `t('key')` |
| `LL.key({ param })` | `t('key', { param })` |
| `locale.set('pl')` | `setLocale('pl')` |
| `setLocale()` | `setLocale()` |

### Type Safety

Both libraries offer type safety. In i18n-svelte-runes-lite:

```typescript
// Define schema from your default locale JSON
type Schema = typeof import('./locales/en.json');

// Create typed i18n instance
const i18n = createI18n<Schema>({
  translations: { en, pl },
  initialLocale: 'en'
});

// t() is now type-safe
i18n.t('nav.dashboard');     // OK
i18n.t('nav.nonexistent');   // TypeScript error
```

### Translation Files

**typesafe-i18n (TypeScript):**
```typescript
// locales/en/index.ts
export default {
  greeting: 'Hello {name:string}!',
  items: '{count:number} item{{s}}'
};
```

**i18n-svelte-runes-lite (JSON):**
```json
{
  "greeting": "Hello {{name}}!",
  "items": {
    "one": "{{count}} item",
    "other": "{{count}} items"
  }
}
```

---

## From i18next/svelte-i18next

### API Mapping

| i18next | i18n-svelte-runes-lite |
|---------|------------------------|
| `$t('key')` | `t('key')` |
| `$t('key', { param })` | `t('key', { param })` |
| `i18n.changeLanguage('pl')` | `setLocale('pl')` |
| `i18n.language` | `i18n.locale` |
| `<Trans>` component | `<Trans>` / `<TransRich>` |

### Namespace Migration

**i18next:**
```typescript
i18n.init({
  ns: ['common', 'dashboard'],
  defaultNS: 'common'
});

// Usage
t('common:greeting');
t('dashboard:title');
```

**i18n-svelte-runes-lite:**
```typescript
const i18n = createI18n({
  namespaceLoaders: {
    en: {
      common: () => import('./locales/en/common.json'),
      dashboard: () => import('./locales/en/dashboard.json')
    }
  },
  defaultNamespace: 'common'
});

// Load namespace before use
await i18n.loadNamespace('dashboard');

// Keys are flat (no namespace prefix needed after merge)
t('greeting');        // from common
t('dashboard.title'); // from dashboard
```

### Trans Component

**i18next:**
```svelte
<Trans i18nKey="terms" components={{ bold: <strong />, link: <a href="/terms" /> }}>
  Accept our <bold>terms</bold> and <link>privacy policy</link>
</Trans>
```

**i18n-svelte-runes-lite:**
```svelte
<TransRich key="terms" {t}>
  {#snippet bold(content)}
    <strong>{content}</strong>
  {/snippet}
  {#snippet link(content)}
    <a href="/terms">{content}</a>
  {/snippet}
</TransRich>
```

---

## Common Pitfalls

### 1. Destructuring Locale Breaks Reactivity

```svelte
<script>
  // WRONG - loses reactivity
  const { locale } = useI18n();
</script>
<p>{locale}</p>  <!-- Never updates! -->

<script>
  // CORRECT - keep reference to object
  const i18n = useI18n();
</script>
<p>{i18n.locale}</p>  <!-- Updates correctly -->
```

### 2. Using t() in Script Without $derived

```svelte
<script>
  const { t } = useI18n();

  // WRONG - computed once, never updates
  const title = t('page.title');

  // CORRECT - recomputes when locale changes
  let title = $derived(t('page.title'));
</script>
```

### 3. Missing SSR Hydration Data

```svelte
<script>
  // WRONG - may cause hydration mismatch
  setI18n({
    translations: { en, pl },
    initialLocale: 'en'  // Hardcoded!
  });

  // CORRECT - use server-provided locale
  let { data } = $props();
  setI18n({
    translations: { en, pl },
    initialLocale: data.locale  // From +layout.server.ts
  });
</script>
```

