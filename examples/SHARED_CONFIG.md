# Shared Configuration Pattern

The shared configuration pattern ensures your server hook and client-side i18n use the same settings, preventing silent failures from mismatched configurations.

## The Problem

Without shared config, you might have:

```typescript
// hooks.server.ts
createI18nHook({
    cookieName: 'app-locale',  // Server uses this cookie name
    endpoint: '/__i18n/save'
});

// +layout.svelte
createI18n({
    storageKey: 'locale',        // Client uses different key - MISMATCH!
    persistenceEndpoint: '/api/i18n'  // Different endpoint - MISMATCH!
});
```

This causes locale persistence to silently fail because the client sends to a different endpoint than the server expects.

## The Solution

Create a shared configuration that's used by both server and client:

### 1. Create the Shared Config

```typescript
// src/lib/i18n/config.ts
import { createSharedConfig } from 'i18n-svelte-runes-lite/config';

export const i18nConfig = createSharedConfig({
    fallbackLocale: 'en',
    supportedLocales: ['en', 'pl', 'de', 'fr'],
    storageKey: 'app-locale',      // Used as cookie name on server, storage key on client
    endpoint: '/__i18n/save'       // Endpoint for bridge persistence
});
```

### 2. Use in Server Hook

```typescript
// src/hooks.server.ts
import { createI18nHook } from 'i18n-svelte-runes-lite/server';
import { i18nConfig } from '$lib/i18n/config';

const i18nHook = createI18nHook({ shared: i18nConfig });

export const handle = i18nHook;

// Or with sequence:
// import { sequence } from '@sveltejs/kit/hooks';
// export const handle = sequence(i18nHook, otherHook);
```

### 3. Use in Client

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { createI18n, setI18n } from 'i18n-svelte-runes-lite';
    import { i18nConfig } from '$lib/i18n/config';
    import en from '$lib/locales/en.json';
    import pl from '$lib/locales/pl.json';

    const { data } = $props();

    const i18n = createI18n({
        shared: i18nConfig,           // Use shared config
        translations: { en, pl },
        initialLocale: data.locale    // From server via locals
    });

    setI18n(i18n);
</script>

{@render children()}
```

### 4. Pass Locale from Server

```typescript
// src/routes/+layout.server.ts
export const load = async ({ locals }) => {
    return { locale: locals.locale };
};
```

## Configuration Priority

When using shared config, values are resolved in this order:

1. **Explicit option** (highest priority)
2. **Shared config value**
3. **Hardcoded default** (lowest priority)

This means you can use shared config as a base but override specific values:

```typescript
createI18n({
    shared: i18nConfig,
    fallbackLocale: 'fr'  // Overrides shared.fallbackLocale
});
```

## Validation

`createSharedConfig()` validates your configuration:

- `fallbackLocale` must be a non-empty string
- `endpoint` must start with `/`
- `storageKey` must be a non-empty string
- If `supportedLocales` is provided but doesn't include `fallbackLocale`, it's added automatically with a warning

```typescript
// This throws an error:
createSharedConfig({
    fallbackLocale: '',           // Error: must be non-empty
    endpoint: 'api/i18n/save'     // Error: must start with /
});

// This warns but continues:
createSharedConfig({
    fallbackLocale: 'en',
    supportedLocales: ['pl', 'de']  // Warning: 'en' not in list, adding it
});
```

## Immutable Config

The returned config object is frozen (`Object.freeze()`) to prevent accidental mutation:

```typescript
const config = createSharedConfig({ fallbackLocale: 'en' });

config.fallbackLocale = 'pl';  // Silently fails (or throws in strict mode)
```

## Benefits

1. **Single source of truth** - No more duplicated configuration
2. **Type safety** - TypeScript ensures both sides use the same interface
3. **Validation** - Catches common mistakes at startup
4. **Suppressed warnings** - No more "make sure your server hook matches" warnings
5. **Easier maintenance** - Change settings in one place

## Migration from Separate Configs

If you have existing separate configurations:

**Before:**
```typescript
// hooks.server.ts
createI18nHook({
    fallbackLocale: 'en',
    cookieName: 'locale',
    endpoint: '/__i18n/save'
});

// +layout.svelte
createI18n({
    fallbackLocale: 'en',
    storageKey: 'locale',
    persistenceEndpoint: '/__i18n/save'
});
```

**After:**
```typescript
// src/lib/i18n/config.ts
export const i18nConfig = createSharedConfig({
    fallbackLocale: 'en',
    storageKey: 'locale',
    endpoint: '/__i18n/save'
});

// hooks.server.ts
createI18nHook({ shared: i18nConfig });

// +layout.svelte
createI18n({ shared: i18nConfig, translations, initialLocale: data.locale });
```

## Complete Example

See [SVELTEKIT_COMPLETE.md](./SVELTEKIT_COMPLETE.md) for a full SvelteKit integration example using shared config.
