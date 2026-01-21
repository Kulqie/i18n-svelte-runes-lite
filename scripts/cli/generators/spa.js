/**
 * SPA Generator
 *
 * Generates i18n configuration files for simple Svelte SPA projects.
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
// Main Entry Point
// ============================================================================

/**
 * Generates or patches main.ts/main.js
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateMain(config) {
    const { cwd, isTypeScript } = config;

    const ext = isTypeScript ? 'ts' : 'js';
    const mainPath = path.join(cwd, 'src', `main.${ext}`);
    const altPath = path.join(cwd, 'src', `main.${isTypeScript ? 'js' : 'ts'}`);

    const existingPath = fs.existsSync(mainPath) ? mainPath :
        fs.existsSync(altPath) ? altPath : null;

    if (existingPath) {
        // Main already exists, don't touch it
        return { file: null };
    }

    // Create new main.ts/js
    const content = `import App from './App.svelte';

const app = new App({
    target: document.getElementById('app')${isTypeScript ? '!' : ''}
});

export default app;
`;

    writeFile(mainPath, content);
    return { file: `src/main.${ext}` };
}

// ============================================================================
// App Component
// ============================================================================

/**
 * Generates or patches App.svelte with i18n singleton pattern
 * Uses createI18n singleton pattern (exports t, setLocale from index.ts)
 *
 * This matches the README's recommended pattern for SPA apps.
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
            error: `Please manually update App.svelte. Import t and setLocale:
  <script>
    import { t, setLocale, supportedLocales } from '${i18nImportPath}';
  </script>

  <h1>{t('hello')}</h1>
  <button onclick={() => setLocale('pl')}>Polski</button>`
        };
    }

    // Create new App.svelte using singleton pattern
    const scriptLang = isTypeScript ? ' lang="ts"' : '';

    const content = `<script${scriptLang}>
    import { t, setLocale, supportedLocales } from '${i18nImportPath}';

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
        <select id="locale" onchange={handleLocaleChange}>
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
        max-width: 800px;
        margin: 0 auto;
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
// Index HTML
// ============================================================================

/**
 * Checks and optionally creates index.html
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateIndexHtml(config) {
    const { cwd, isTypeScript } = config;

    const indexPath = path.join(cwd, 'index.html');

    if (fs.existsSync(indexPath)) {
        // Don't modify existing index.html
        return { file: null };
    }

    const ext = isTypeScript ? 'ts' : 'js';

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Svelte App</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.${ext}"></script>
</body>
</html>
`;

    writeFile(indexPath, content);
    return { file: 'index.html' };
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generates all SPA i18n files
 * @param {object} config - Generation config
 * @returns {Promise<{ files: string[], errors: string[] }>}
 */
export async function generateSPA(config) {
    const files = [];
    const errors = [];

    // Generate main.ts/js
    const mainResult = generateMain(config);
    if (mainResult.file) files.push(mainResult.file);
    if (mainResult.error) errors.push(mainResult.error);

    // Generate App.svelte
    const appResult = generateApp(config);
    if (appResult.file) files.push(appResult.file);
    if (appResult.error) errors.push(appResult.error);

    // Generate index.html if needed
    const indexResult = generateIndexHtml(config);
    if (indexResult.file) files.push(indexResult.file);
    if (indexResult.error) errors.push(indexResult.error);

    return { files, errors };
}
