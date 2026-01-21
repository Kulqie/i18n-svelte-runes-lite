/**
 * Wails/Desktop Generator
 *
 * Generates i18n configuration files for Wails, Tauri, and Electron projects.
 * Uses createI18n singleton pattern with exported t/setLocale functions.
 *
 * This matches the README's recommended pattern for desktop/SPA apps.
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
 * Generates or patches App.svelte with i18n singleton pattern
 * Uses createI18n singleton pattern (exports t, setLocale from index.ts)
 *
 * This matches the README's recommended pattern for Wails/Desktop apps.
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
        if (content.includes('i18n-svelte-runes-lite') || content.includes("from '$lib/i18n'") || content.includes("from './lib/i18n'")) {
            return { file: null, error: 'App.svelte already has i18n configuration' };
        }

        // Can't easily patch, return instructions
        return {
            file: null,
            error: `Please manually update App.svelte. Import i18n, t, and setLocale:
  <script>
    import { i18n, t, setLocale, supportedLocales } from '${i18nImportPath}';
  </script>

  <h1>{t('hello')}</h1>
  <p>Current: {i18n.locale}</p>
  <button onclick={() => setLocale('pl')}>Polski</button>`
        };
    }

    // Create new App.svelte using singleton pattern
    const scriptLang = isTypeScript ? ' lang="ts"' : '';

    const content = `<script${scriptLang}>
    import { i18n, t, setLocale, supportedLocales } from '${i18nImportPath}';

    function handleLocaleChange(e${isTypeScript ? ': Event' : ''}) {
        const target = e.target${isTypeScript ? ' as HTMLSelectElement' : ''};
        setLocale(target.value);
    }
</script>

<main>
    <h1>{t('hello')}</h1>
    <p>{t('welcome')}</p>

    <div class="locale-switcher">
        <label for="locale">Language:</label>
        <!-- Use i18n.locale for reactive current value -->
        <select id="locale" value={i18n.locale} onchange={handleLocaleChange}>
            {#each supportedLocales as loc}
                <option value={loc}>{loc.toUpperCase()}</option>
            {/each}
        </select>
    </div>
</main>

<style>
    main {
        font-family: system-ui, -apple-system, sans-serif;
        text-align: center;
        padding: 2rem;
    }

    .locale-switcher {
        margin-top: 2rem;
    }

    select {
        padding: 0.5rem;
        font-size: 1rem;
        margin-left: 0.5rem;
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
