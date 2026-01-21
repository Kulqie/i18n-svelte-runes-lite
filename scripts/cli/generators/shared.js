/**
 * Shared Generators
 *
 * Common file generation utilities used across all framework types.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path to ensure
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Writes a file, creating parent directories if needed
 * @param {string} filePath - File path to write
 * @param {string} content - File content
 */
function writeFile(filePath, content) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Creates a backup of an existing file
 * @param {string} filePath - File to backup
 * @returns {string | null} - Backup path or null if file doesn't exist
 */
function createBackup(filePath) {
    if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.bak';
        fs.copyFileSync(filePath, backupPath);
        return backupPath;
    }
    return null;
}

// ============================================================================
// Vite Config Patching
// ============================================================================

/**
 * Build the i18n configuration dynamically based on what's missing
 * @param {boolean} needsOptimizeDeps - Whether to include optimizeDeps
 * @param {boolean} needsSsr - Whether to include ssr config
 * @returns {string}
 */
function buildViteI18nConfig(needsOptimizeDeps, needsSsr) {
    const parts = [];

    if (needsOptimizeDeps) {
        parts.push(`    // i18n-svelte-runes-lite: exclude from pre-bundling
    optimizeDeps: {
        exclude: ['i18n-svelte-runes-lite']
    }`);
    }

    if (needsSsr) {
        parts.push(`    // i18n-svelte-runes-lite: bundle for SSR
    ssr: {
        noExternal: ['i18n-svelte-runes-lite']
    }`);
    }

    return parts.length > 0 ? '\n' + parts.join(',\n') : '';
}

/**
 * Manual instructions for users when auto-patching fails
 */
const MANUAL_INSTRUCTIONS = `
Please add the following to your vite.config:

    optimizeDeps: {
        exclude: ['i18n-svelte-runes-lite']
    },
    ssr: {
        noExternal: ['i18n-svelte-runes-lite']
    }

If you already have these properties, merge the arrays:

    optimizeDeps: {
        exclude: [...existingExcludes, 'i18n-svelte-runes-lite']
    },
    ssr: {
        noExternal: [...existingNoExternal, 'i18n-svelte-runes-lite']
    }`;

/**
 * Patches the Vite config to include i18n settings
 * @param {object} config - Generation config
 * @returns {Promise<{ success: boolean, file?: string, error?: string }>}
 */
export async function patchViteConfig(config) {
    const { cwd, isTypeScript } = config;

    // Find vite config file
    const viteConfigPath = isTypeScript
        ? path.join(cwd, 'vite.config.ts')
        : path.join(cwd, 'vite.config.js');

    const altPath = isTypeScript
        ? path.join(cwd, 'vite.config.js')
        : path.join(cwd, 'vite.config.ts');

    let configPath = fs.existsSync(viteConfigPath) ? viteConfigPath : null;
    if (!configPath && fs.existsSync(altPath)) {
        configPath = altPath;
    }

    if (!configPath) {
        // Create a new vite config
        const newConfig = generateViteConfig(config);
        const newPath = path.join(cwd, `vite.config.${isTypeScript ? 'ts' : 'js'}`);
        writeFile(newPath, newConfig);
        return { success: true, file: `vite.config.${isTypeScript ? 'ts' : 'js'}` };
    }

    // Read existing config
    const content = fs.readFileSync(configPath, 'utf8');

    // Check if already patched
    if (content.includes('i18n-svelte-runes-lite')) {
        return { success: true, file: path.basename(configPath), error: 'Already configured' };
    }

    // Check for existing properties that would cause duplicates
    const hasOptimizeDeps = /\boptimizeDeps\s*:/.test(content);
    const hasSsr = /\bssr\s*:/.test(content);

    // If both properties exist, we can't safely auto-patch
    if (hasOptimizeDeps && hasSsr) {
        return {
            success: false,
            error: `${path.basename(configPath)} already has optimizeDeps and ssr properties.\n${MANUAL_INSTRUCTIONS}`
        };
    }

    // Create backup
    createBackup(configPath);

    // Patch the config with only the missing properties
    const patched = patchViteContent(content, !hasOptimizeDeps, !hasSsr);

    if (patched === content) {
        return {
            success: false,
            error: `Could not automatically patch ${path.basename(configPath)}.\n${MANUAL_INSTRUCTIONS}`
        };
    }

    fs.writeFileSync(configPath, patched, 'utf8');

    // Warn if we only added partial config
    let warning = null;
    if (hasOptimizeDeps) {
        warning = 'Note: optimizeDeps already exists. Please manually add i18n-svelte-runes-lite to optimizeDeps.exclude';
    } else if (hasSsr) {
        warning = 'Note: ssr already exists. Please manually add i18n-svelte-runes-lite to ssr.noExternal';
    }

    return { success: true, file: path.basename(configPath), error: warning };
}

/**
 * Generates a new vite.config file
 * @param {object} config - Generation config
 * @returns {string}
 */
function generateViteConfig(config) {
    const { isTypeScript, framework } = config;

    if (framework === 'sveltekit') {
        return `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()],
    // i18n-svelte-runes-lite configuration
    optimizeDeps: {
        exclude: ['i18n-svelte-runes-lite']
    },
    ssr: {
        noExternal: ['i18n-svelte-runes-lite']
    }
});
`;
    }

    return `import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    plugins: [svelte()],
    // $lib alias for SvelteKit-like imports
    resolve: {
        alias: {
            $lib: path.resolve('./src/lib')
        }
    },
    // i18n-svelte-runes-lite configuration
    optimizeDeps: {
        exclude: ['i18n-svelte-runes-lite']
    },
    ssr: {
        noExternal: ['i18n-svelte-runes-lite']
    }
});
`;
}

/**
 * Patches existing vite config content with improved robustness
 * @param {string} content - Existing config content
 * @param {boolean} needsOptimizeDeps - Whether to add optimizeDeps config
 * @param {boolean} needsSsr - Whether to add ssr config
 * @returns {string} - Patched content (unchanged if patching fails)
 */
function patchViteContent(content, needsOptimizeDeps = true, needsSsr = true) {
    // Build the config to insert based on what's needed
    const configToInsert = buildViteI18nConfig(needsOptimizeDeps, needsSsr);

    // If nothing to insert, return unchanged
    if (!configToInsert) {
        return content;
    }

    /**
     * Insert config after opening brace, handling empty objects correctly
     */
    function insertAfterBrace(content, braceIndex) {
        const afterBrace = content.slice(braceIndex + 1);
        const trimmed = afterBrace.trimStart();

        // Check if object is empty: {} or { }
        if (trimmed.startsWith('}')) {
            // Empty object - insert without trailing comma
            return content.slice(0, braceIndex + 1) +
                   configToInsert +
                   content.slice(braceIndex + 1);
        }

        // Object has content - need trailing comma
        // Check if there's already a property (skip whitespace/newlines)
        if (trimmed.match(/^[a-zA-Z_$]/)) {
            // Starts with property name - add comma
            return content.slice(0, braceIndex + 1) +
                   configToInsert + ',' +
                   content.slice(braceIndex + 1);
        }

        // Has some content but doesn't start with property (comments, etc.)
        return content.slice(0, braceIndex + 1) +
               configToInsert + ',' +
               content.slice(braceIndex + 1);
    }

    /**
     * Find the first non-commented match of a regex pattern
     * Returns the match and its index, or null if not found or only in comments
     */
    function findNonCommentedMatch(content, pattern) {
        const regex = new RegExp(pattern, 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
            const beforeMatch = content.slice(0, match.index);
            const lineStart = beforeMatch.lastIndexOf('\n') + 1;
            const lineContent = content.slice(lineStart, match.index);

            // Skip if preceded by // on the same line
            if (lineContent.includes('//')) {
                continue;
            }

            // Check if inside a block comment
            const openComments = (beforeMatch.match(/\/\*/g) || []).length;
            const closeComments = (beforeMatch.match(/\*\//g) || []).length;
            if (openComments > closeComments) {
                continue;
            }

            return { match, index: match.index };
        }
        return null;
    }

    // Strategy 0: Check for aliased defineConfig (e.g., `import { defineConfig as viteConfig }`)
    const aliasMatch = content.match(/import\s*\{[^}]*defineConfig\s+as\s+(\w+)[^}]*\}\s*from\s*['"]vite['"]/);
    if (aliasMatch) {
        const aliasName = aliasMatch[1];
        const aliasResult = findNonCommentedMatch(content, `${aliasName}\\s*\\(\\s*\\{`);
        if (aliasResult) {
            const braceIndex = content.indexOf('{', aliasResult.index);
            return insertAfterBrace(content, braceIndex);
        }
    }

    // Strategy 1: Standard defineConfig({ ... })
    const defineConfigResult = findNonCommentedMatch(content, 'defineConfig\\s*\\(\\s*\\{');
    if (defineConfigResult) {
        const braceIndex = content.indexOf('{', defineConfigResult.index);
        return insertAfterBrace(content, braceIndex);
    }

    // Strategy 2: export default { ... }
    const exportDefaultResult = findNonCommentedMatch(content, 'export\\s+default\\s*\\{');
    if (exportDefaultResult) {
        const braceIndex = content.indexOf('{', exportDefaultResult.index);
        return insertAfterBrace(content, braceIndex);
    }

    // Strategy 3: Async defineConfig with return
    const asyncResult = findNonCommentedMatch(content, 'defineConfig\\s*\\(\\s*async');
    if (asyncResult) {
        const returnResult = findNonCommentedMatch(content.slice(asyncResult.index), 'return\\s*\\{');
        if (returnResult) {
            const returnIndex = asyncResult.index + returnResult.index;
            const braceIndex = content.indexOf('{', returnIndex);
            return insertAfterBrace(content, braceIndex);
        }
    }

    // Strategy 4 & 5: defineConfig with arrow function
    const defineConfigSimple = findNonCommentedMatch(content, 'defineConfig');
    if (defineConfigSimple) {
        const defineConfigIndex = defineConfigSimple.index;
        const contentAfterDefine = content.slice(defineConfigIndex);

        // Strategy 4: Look for arrow function with block body (=> {) that has a return statement
        // Use comment-aware search for the arrow and return
        const arrowBlockResult = findNonCommentedMatch(contentAfterDefine, '=>\\s*\\{');
        if (arrowBlockResult) {
            const returnResult = findNonCommentedMatch(contentAfterDefine, 'return\\s*\\{');
            if (returnResult) {
                const returnIndex = defineConfigIndex + returnResult.index;
                const braceIndex = content.indexOf('{', returnIndex);
                const result = insertAfterBrace(content, braceIndex);
                // Validate bracket balance
                if (isBalanced(result)) {
                    return result;
                }
            }
        }

        // Strategy 5: defineConfig with arrow function returning object directly
        // Matches: defineConfig(({ mode }) => ({ ... }))
        // Also handles comments between => and ({ using comment-aware search
        const arrowObjectResult = findNonCommentedMatch(contentAfterDefine, '=>\\s*\\(\\s*\\{');
        if (arrowObjectResult) {
            // Find the opening brace of the returned object (after the arrow)
            const arrowIndex = content.indexOf('=>', defineConfigIndex);
            if (arrowIndex !== -1) {
                // Find the '(' after '=>', skipping whitespace and comments
                let searchPos = arrowIndex + 2;
                while (searchPos < content.length) {
                    const char = content[searchPos];
                    if (char === '(') {
                        const braceIndex = content.indexOf('{', searchPos);
                        if (braceIndex !== -1) {
                            const result = insertAfterBrace(content, braceIndex);
                            // Validate bracket balance
                            if (isBalanced(result)) {
                                return result;
                            }
                        }
                        break;
                    } else if (char === '/' && content[searchPos + 1] === '/') {
                        // Skip line comment
                        searchPos = content.indexOf('\n', searchPos);
                        if (searchPos === -1) break;
                    } else if (char === '/' && content[searchPos + 1] === '*') {
                        // Skip block comment
                        searchPos = content.indexOf('*/', searchPos);
                        if (searchPos === -1) break;
                        searchPos += 2;
                    } else if (/\s/.test(char)) {
                        searchPos++;
                    } else {
                        break; // Unexpected character
                    }
                }
            }
        }
    }

    // Could not patch - return unchanged content
    return content;
}

/**
 * Check if braces/brackets are balanced in the content
 * @param {string} content - Content to check
 * @returns {boolean} - True if balanced
 */
function isBalanced(content) {
    const stack = [];
    const pairs = { '{': '}', '[': ']', '(': ')' };
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        // Handle string literals (skip their contents)
        // Count consecutive backslashes to handle escaped backslashes (e.g., "C:\\")
        if (char === '"' || char === "'" || char === '`') {
            let backslashCount = 0;
            for (let j = i - 1; j >= 0 && content[j] === '\\'; j--) {
                backslashCount++;
            }
            // Quote is escaped only if preceded by odd number of backslashes
            if (backslashCount % 2 === 0) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }
            continue;
        }

        if (inString) continue;

        // Track brackets
        if (char in pairs) {
            stack.push(pairs[char]);
        } else if (char === '}' || char === ']' || char === ')') {
            if (stack.length === 0 || stack.pop() !== char) {
                return false;
            }
        }
    }

    return stack.length === 0;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Converts a localesPath to a SvelteKit $lib import path
 * e.g., 'src/lib/i18n/locales' -> '$lib/i18n/locales'
 * e.g., 'src/lib/translations/locales' -> '$lib/translations/locales'
 * @param {string} localesPath - The user-provided locales path
 * @returns {string} - SvelteKit alias path
 */
export function toSvelteKitAlias(localesPath) {
    // If it starts with src/lib/, convert to $lib/
    if (localesPath.startsWith('src/lib/')) {
        return localesPath.replace('src/lib/', '$lib/');
    }
    // If it starts with src/, use relative from routes
    if (localesPath.startsWith('src/')) {
        // From src/routes/+layout.svelte, we need to go up to src/
        return '../' + localesPath.slice(4); // Remove 'src/'
    }
    // Otherwise return as-is (might be absolute or custom)
    return localesPath;
}

/**
 * Converts a localesPath to a relative import path from src/App.svelte
 * e.g., 'src/lib/i18n/locales' -> './lib/i18n'
 * @param {string} localesPath - The user-provided locales path
 * @returns {string} - Relative import path for the i18n directory (parent of locales)
 */
export function toRelativeFromSrc(localesPath) {
    // Get the i18n directory (parent of locales)
    const i18nDir = localesPath.replace(/\/locales\/?$/, '');

    // If it starts with src/, convert to relative from src/
    if (i18nDir.startsWith('src/')) {
        return './' + i18nDir.slice(4); // Remove 'src/' and add './'
    }
    // Otherwise return as-is
    return i18nDir;
}

// ============================================================================
// Locale Code Utilities
// ============================================================================

/**
 * Converts a locale code to a valid JavaScript identifier
 * e.g., 'en-US' -> 'enUS', 'zh-Hans' -> 'zhHans'
 * @param {string} locale - Locale code
 * @returns {string} - Valid JS identifier
 */
function localeToIdentifier(locale) {
    return locale.replace(/-([a-zA-Z])/g, (_, char) => char.toUpperCase());
}

// ============================================================================
// Locale Files
// ============================================================================

/**
 * Creates locale JSON files
 * @param {object} config - Generation config
 * @returns {Promise<{ files: string[] }>}
 */
export async function createLocaleFiles(config) {
    const { cwd, languages, localesPath, useNamespaces, defaultLanguage } = config;
    const fullLocalesPath = path.join(cwd, localesPath);
    const files = [];

    ensureDir(fullLocalesPath);

    if (useNamespaces) {
        // Create namespaced structure: en/common.json, en/auth.json, etc.
        for (const lang of languages) {
            const langDir = path.join(fullLocalesPath, lang);
            ensureDir(langDir);

            // Create common.json with sample content
            const commonPath = path.join(langDir, 'common.json');
            if (!fs.existsSync(commonPath)) {
                const content = generateSampleTranslations(lang, defaultLanguage, 'common');
                writeFile(commonPath, JSON.stringify(content, null, 2) + '\n');
                files.push(path.join(localesPath, lang, 'common.json'));
            }
        }
    } else {
        // Create bundled structure: en.json, pl.json, etc.
        for (const lang of languages) {
            const filePath = path.join(fullLocalesPath, `${lang}.json`);
            if (!fs.existsSync(filePath)) {
                const content = generateSampleTranslations(lang, defaultLanguage, null);
                writeFile(filePath, JSON.stringify(content, null, 2) + '\n');
                files.push(path.join(localesPath, `${lang}.json`));
            }
        }
    }

    return { files };
}

/**
 * Generates sample translations for a language
 * @param {string} lang - Language code
 * @param {string} defaultLang - Default language code
 * @param {string | null} namespace - Namespace name or null for bundled
 * @returns {object}
 */
function generateSampleTranslations(lang, defaultLang, namespace) {
    // Sample translations in different languages
    const samples = {
        en: {
            hello: 'Hello',
            welcome: 'Welcome to our app',
            'nav.home': 'Home',
            'nav.about': 'About',
            'nav.contact': 'Contact'
        },
        pl: {
            hello: 'Cześć',
            welcome: 'Witamy w naszej aplikacji',
            'nav.home': 'Strona główna',
            'nav.about': 'O nas',
            'nav.contact': 'Kontakt'
        },
        de: {
            hello: 'Hallo',
            welcome: 'Willkommen in unserer App',
            'nav.home': 'Startseite',
            'nav.about': 'Über uns',
            'nav.contact': 'Kontakt'
        },
        es: {
            hello: 'Hola',
            welcome: 'Bienvenido a nuestra aplicación',
            'nav.home': 'Inicio',
            'nav.about': 'Acerca de',
            'nav.contact': 'Contacto'
        },
        fr: {
            hello: 'Bonjour',
            welcome: 'Bienvenue dans notre application',
            'nav.home': 'Accueil',
            'nav.about': 'À propos',
            'nav.contact': 'Contact'
        }
    };

    // Use sample translations if available, otherwise use English as template
    const translations = samples[lang] || samples['en'];

    if (namespace === 'common') {
        // For namespaced, just return flat keys
        return {
            hello: translations.hello,
            welcome: translations.welcome
        };
    }

    // For bundled, include nested nav
    return {
        hello: translations.hello,
        welcome: translations.welcome,
        nav: {
            home: translations['nav.home'],
            about: translations['nav.about'],
            contact: translations['nav.contact']
        }
    };
}

// ============================================================================
// Locales Index File
// ============================================================================

/**
 * Creates the locales index file (locales.ts for SvelteKit, index.ts for SPA/Wails)
 *
 * Note: For SPA/Wails we use index.ts (not index.svelte.ts) because:
 * 1. The generated code doesn't use Svelte runes
 * 2. Vite doesn't auto-resolve .svelte.ts for directory imports
 *
 * @param {object} config - Generation config
 * @returns {Promise<{ file: string | null }>}
 */
export async function createLocalesIndex(config) {
    const { cwd, languages, localesPath, useNamespaces, defaultLanguage, isTypeScript, framework } = config;

    const i18nDir = path.join(cwd, path.dirname(localesPath));
    ensureDir(i18nDir);

    const ext = isTypeScript ? 'ts' : 'js';
    // SvelteKit: locales.ts (separate file, context pattern uses it)
    // SPA/Wails: index.ts (allows `import from '$lib/i18n'` directory import)
    const indexFileName = framework === 'sveltekit' ? `locales.${ext}` : `index.${ext}`;
    const indexPath = path.join(i18nDir, indexFileName);

    // Don't overwrite if exists
    if (fs.existsSync(indexPath)) {
        return { file: null };
    }

    let content;

    if (useNamespaces) {
        content = generateNamespacedIndex(config);
    } else {
        content = generateBundledIndex(config);
    }

    writeFile(indexPath, content);
    return { file: path.join(path.dirname(localesPath), indexFileName) };
}

/**
 * Generates bundled locales index
 * @param {object} config - Generation config
 * @returns {string}
 */
function generateBundledIndex(config) {
    const { languages, defaultLanguage, isTypeScript, framework } = config;

    const imports = languages.map(lang => {
        const identifier = localeToIdentifier(lang);
        return `import ${identifier} from './locales/${lang}.json';`;
    }).join('\n');

    // Map locale codes to their identifiers, using shorthand when they match
    const localesObject = languages.map(lang => {
        const identifier = localeToIdentifier(lang);
        return identifier === lang ? `    ${lang}` : `    '${lang}': ${identifier}`;
    }).join(',\n');

    if (framework === 'sveltekit') {
        return `${imports}

export const locales = {
${localesObject}
}${isTypeScript ? ' as const' : ''};

export const defaultLocale = '${defaultLanguage}';
export const supportedLocales = [${languages.map(l => `'${l}'`).join(', ')}]${isTypeScript ? ' as const' : ''};

export type Locale = typeof supportedLocales[number];
export type Translations = typeof import('./locales/${defaultLanguage}.json');
`;
    }

    // SPA/Wails version - use createI18n singleton pattern
    // This matches the README's recommended pattern for desktop apps
    const defaultIdentifier = localeToIdentifier(defaultLanguage);
    const typeAnnotation = isTypeScript ? `<typeof ${defaultIdentifier}>` : '';

    // Add extra indentation for translations object (8 spaces total)
    const translationsObject = languages.map(lang => {
        const identifier = localeToIdentifier(lang);
        return identifier === lang ? `        ${lang}` : `        '${lang}': ${identifier}`;
    }).join(',\n');

    return `import { createI18n } from 'i18n-svelte-runes-lite';
${imports}

// Export i18n instance for reactive access to i18n.locale
export const i18n = createI18n${typeAnnotation}({
    translations: {
${translationsObject}
    },
    initialLocale: '${defaultLanguage}'
});

// Export commonly used functions
export const t = i18n.t;
export const setLocale = i18n.setLocale;
export const supportedLocales = [${languages.map(l => `'${l}'`).join(', ')}];
// Access current locale via i18n.locale (reactive getter)
`;
}

/**
 * Generates namespaced locales index
 * @param {object} config - Generation config
 * @returns {string}
 */
function generateNamespacedIndex(config) {
    const { languages, defaultLanguage, isTypeScript, framework } = config;

    if (framework === 'sveltekit') {
        return `// Namespaced locale loader
export const defaultLocale = '${defaultLanguage}';
export const supportedLocales = [${languages.map(l => `'${l}'`).join(', ')}]${isTypeScript ? ' as const' : ''};

export type Locale = typeof supportedLocales[number];

/**
 * Load a namespace for a specific locale
 */
export async function loadNamespace(locale${isTypeScript ? ': Locale' : ''}, namespace${isTypeScript ? ': string' : ''}) {
    try {
        const module = await import(/* @vite-ignore */ \`./locales/\${locale}/\${namespace}.json\`);
        return module.default;
    } catch {
        // Fallback to default locale
        if (locale !== defaultLocale) {
            return loadNamespace(defaultLocale, namespace);
        }
        return {};
    }
}

/**
 * Load all namespaces for a locale
 */
export async function loadLocale(locale${isTypeScript ? ': Locale' : ''}, namespaces${isTypeScript ? ': string[]' : ''} = ['common']) {
    const translations${isTypeScript ? ': Record<string, unknown>' : ''} = {};
    for (const ns of namespaces) {
        translations[ns] = await loadNamespace(locale, ns);
    }
    return translations;
}
`;
    }

    // SPA/Wails namespaced version
    return `import { createI18n } from 'i18n-svelte-runes-lite';

export const defaultLocale = '${defaultLanguage}';
export const supportedLocales = [${languages.map(l => `'${l}'`).join(', ')}];

/**
 * Load a namespace for a specific locale
 */
async function loadNamespace(locale${isTypeScript ? ': string' : ''}, namespace${isTypeScript ? ': string' : ''}) {
    try {
        const module = await import(/* @vite-ignore */ \`./locales/\${locale}/\${namespace}.json\`);
        return module.default;
    } catch {
        if (locale !== defaultLocale) {
            return loadNamespace(defaultLocale, namespace);
        }
        return {};
    }
}

/**
 * Create i18n instance with namespace support
 */
export async function initI18n(locale = defaultLocale, namespaces = ['common']) {
    const translations = {};
    for (const ns of namespaces) {
        const nsTranslations = await loadNamespace(locale, ns);
        Object.assign(translations, nsTranslations);
    }

    return createI18n({
        locales: { [locale]: translations },
        defaultLocale: locale
    });
}
`;
}
