/**
 * Wails/Desktop Generator
 *
 * Generates i18n configuration files for Wails, Tauri, and Electron projects.
 * Uses setI18n()/useI18n() context pattern (NOT I18nProvider - that doesn't exist)
 *
 * NOTE: The library's built-in persistence handles localStorage automatically
 * for desktop environments (Wails/Tauri/Electron). No separate persist.ts needed.
 */

import fs from 'fs';
import path from 'path';
import { toRelativeFromSrc } from './shared.js';

// ============================================================================
// File Utilities
// ============================================================================

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeFile(filePath, content) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
}

// ============================================================================
// Main App Component
// ============================================================================

/**
 * Generates or patches App.svelte with i18n context
 * Uses setI18n()/useI18n() pattern (NOT I18nProvider)
 *
 * NOTE: We rely on the library's built-in persistence (strategy: 'auto' defaults
 * to 'localStorage' for desktop environments). No manual $effect or persist.ts needed.
 *
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateApp(config) {
    const { cwd, isTypeScript, localesPath } = config;

    const appPath = path.join(cwd, 'src', 'App.svelte');

    // Calculate the import path for i18n module
    // e.g., 'src/lib/i18n/locales' -> './lib/i18n'
    const i18nImportPath = toRelativeFromSrc(localesPath);

    if (fs.existsSync(appPath)) {
        let content = fs.readFileSync(appPath, 'utf8');

        // Check if already has i18n
        if (content.includes('i18n-svelte-runes-lite') || content.includes('setI18n')) {
            return { file: null, error: 'App.svelte already has i18n configuration' };
        }

        // Can't easily patch, return instructions
        return {
            file: null,
            error: `Please manually update App.svelte. Add setI18n in the root component:
  <script>
    import { setI18n, useI18n } from 'i18n-svelte-runes-lite';
    import { locales, defaultLocale } from '${i18nImportPath}';

    // Library auto-detects desktop environment and uses localStorage for persistence
    setI18n({ translations: locales, initialLocale: defaultLocale });
    const i18n = useI18n();
  </script>

  <h1>{i18n.t('hello')}</h1>`
        };
    }

    // Create new App.svelte using setI18n pattern
    // NOTE: The library handles persistence automatically via strategy: 'auto'
    // which detects Wails/Tauri/Electron and uses localStorage
    const scriptLang = isTypeScript ? ' lang="ts"' : '';

    const content = `<script${scriptLang}>
    import { setI18n, useI18n } from 'i18n-svelte-runes-lite';
    import { locales, defaultLocale, supportedLocales } from '${i18nImportPath}';

    // Initialize i18n context (must be in root component)
    // The library auto-detects desktop environment and:
    // - Uses localStorage for persistence (strategy: 'auto')
    // - Detects initial locale from localStorage or system language
    setI18n({
        translations: locales,
        fallbackLocale: defaultLocale
        // strategy: 'auto' is default - uses localStorage for desktop apps
    });

    // Get the i18n instance for use in this component
    const i18n = useI18n();
</script>

<main>
    <h1>{i18n.t('hello')}</h1>
    <p>{i18n.t('welcome')}</p>
</main>

<style>
    main {
        font-family: system-ui, -apple-system, sans-serif;
        text-align: center;
        padding: 2rem;
    }
</style>
`;

    writeFile(appPath, content);
    return { file: 'src/App.svelte' };
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generates all Wails/Desktop i18n files
 *
 * NOTE: We no longer generate a separate persist.ts file. The library's built-in
 * persistence handles localStorage automatically for desktop environments when
 * strategy: 'auto' is used (the default). This prevents double-persistence bugs
 * where both the library AND a manual $effect write to localStorage.
 *
 * @param {object} config - Generation config
 * @returns {Promise<{ files: string[], errors: string[] }>}
 */
export async function generateWails(config) {
    const files = [];
    const errors = [];

    // Generate App.svelte (relies on library's built-in persistence)
    const appResult = generateApp(config);
    if (appResult.file) files.push(appResult.file);
    if (appResult.error) errors.push(appResult.error);

    return { files, errors };
}
