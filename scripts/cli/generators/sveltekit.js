/**
 * SvelteKit Generator
 *
 * Generates i18n configuration files for SvelteKit projects.
 */

import fs from 'fs';
import path from 'path';
import { toSvelteKitAlias } from './shared.js';

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

function createBackup(filePath) {
    if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.bak';
        fs.copyFileSync(filePath, backupPath);
        return backupPath;
    }
    return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a position in the content is inside a comment
 * @param {string} content - Full file content
 * @param {number} position - Position to check
 * @returns {boolean} - True if position is commented out
 */
function isCommentedOut(content, position) {
    // Find the start of the line containing this position
    let lineStart = content.lastIndexOf('\n', position - 1) + 1;
    const lineContent = content.slice(lineStart, position);

    // Check if there's a // comment before this position on the same line
    if (lineContent.includes('//')) {
        return true;
    }

    // Check if we're inside a block comment - use counting approach
    const beforeContent = content.slice(0, position);
    const openComments = (beforeContent.match(/\/\*/g) || []).length;
    const closeComments = (beforeContent.match(/\*\//g) || []).length;
    return openComments > closeComments;
}

/**
 * Finds the matching closing brace for an opening brace, handling nested braces
 * Properly handles strings and comments to avoid false matches
 * @param {string} content - Full file content
 * @param {number} openBraceIndex - Index of the opening brace
 * @returns {number} - Index of the matching closing brace, or -1 if not found
 */
function findMatchingBrace(content, openBraceIndex) {
    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = openBraceIndex + 1; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';
        const nextChar = i < content.length - 1 ? content[i + 1] : '';

        // Handle line comments
        if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
            inLineComment = true;
            continue;
        }
        if (inLineComment && char === '\n') {
            inLineComment = false;
            continue;
        }
        if (inLineComment) continue;

        // Handle block comments
        if (!inString && char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++; // Skip the *
            continue;
        }
        if (inBlockComment && char === '*' && nextChar === '/') {
            inBlockComment = false;
            i++; // Skip the /
            continue;
        }
        if (inBlockComment) continue;

        // Handle strings (single, double, and template literals)
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

        // Count braces
        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1; // No matching brace found
}

// ============================================================================
// app.d.ts Generation
// ============================================================================

/**
 * Generates or patches app.d.ts with locale types
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateAppDts(config) {
    const { cwd, languages, defaultLanguage } = config;
    const appDtsPath = path.join(cwd, 'src', 'app.d.ts');

    // Use a unique type name to avoid collisions with user-defined Locale types
    const localeTypeName = 'I18nLocale';
    const localeType = `type ${localeTypeName} = ${languages.map(l => `'${l}'`).join(' | ')};`;

    if (fs.existsSync(appDtsPath)) {
        // Patch existing app.d.ts
        let content = fs.readFileSync(appDtsPath, 'utf8');

        // Check if already has locale in Locals
        if (content.includes('locale:') || content.includes('locale?:')) {
            return { file: null, error: 'app.d.ts already has locale defined' };
        }

        // Check if I18nLocale type already exists
        if (content.includes('I18nLocale')) {
            return { file: null, error: 'app.d.ts already has I18nLocale type defined' };
        }

        createBackup(appDtsPath);

        // Try to add locale to App.Locals interface using brace-matching
        // This handles nested objects like `user: { id: string }` correctly
        // Also handles exported interfaces: `export interface Locals {`
        // Also handles interface extension: `interface Locals extends Record<string, any> {`
        const localsInterfaceMatch = content.match(/^[ \t]*(?:export\s+)?interface\s+Locals\b[^{]*\{/m);
        if (localsInterfaceMatch && !isCommentedOut(content, localsInterfaceMatch.index)) {
            const openBraceIndex = content.indexOf('{', localsInterfaceMatch.index);
            const closeBraceIndex = findMatchingBrace(content, openBraceIndex);

            if (closeBraceIndex !== -1) {
                // Extract the interface body content
                const localsContent = content.slice(openBraceIndex + 1, closeBraceIndex);

                // Insert the new property before the closing brace
                const newLocalsContent = localsContent.trimEnd() + `\n        locale: ${localeTypeName};\n    `;
                content = content.slice(0, openBraceIndex + 1) + newLocalsContent + content.slice(closeBraceIndex);

                // Add I18nLocale type before the declare global
                content = `${localeType}\n\n${content}`;

                writeFile(appDtsPath, content);
                return { file: 'src/app.d.ts' };
            }
        }

        // Check if Locals is defined as a type alias instead of interface
        // `type Locals = { ... }` cannot be safely auto-patched (would cause duplicate identifier)
        const localsTypeMatch = content.match(/^[ \t]*(?:export\s+)?type\s+Locals\s*=/m);
        if (localsTypeMatch && !isCommentedOut(content, localsTypeMatch.index)) {
            return {
                file: null,
                error: `app.d.ts uses 'type Locals' instead of 'interface Locals'. Please manually add 'locale: ${localeTypeName}' to your Locals type, or convert it to an interface for automatic patching.`
            };
        }

        // Try to find existing namespace App and insert Locals interface there
        // This avoids creating duplicate `declare global` blocks
        const namespaceAppMatch = content.match(/^[ \t]*namespace\s+App\s*\{/m);
        if (namespaceAppMatch && !isCommentedOut(content, namespaceAppMatch.index)) {
            const openBraceIndex = content.indexOf('{', namespaceAppMatch.index);
            const closeBraceIndex = findMatchingBrace(content, openBraceIndex);

            if (closeBraceIndex !== -1) {
                // Insert the Locals interface before the closing brace of namespace App
                const beforeClose = content.slice(0, closeBraceIndex);
                const afterClose = content.slice(closeBraceIndex);

                // Check indentation of namespace content
                const namespaceContent = content.slice(openBraceIndex + 1, closeBraceIndex);
                const indentMatch = namespaceContent.match(/\n([ \t]+)/);
                const indent = indentMatch ? indentMatch[1] : '        ';

                const localsInterface = `\n${indent}interface Locals {\n${indent}    locale: ${localeTypeName};\n${indent}}\n    `;

                content = `${localeType}\n\n${beforeClose}${localsInterface}${afterClose}`;

                writeFile(appDtsPath, content);
                return { file: 'src/app.d.ts' };
            }
        }

        // Last resort: no namespace App found, prepend complete declaration
        // This should be rare - most SvelteKit projects have app.d.ts with namespace App
        const newContent = `${localeType}

declare global {
    namespace App {
        interface Locals {
            locale: ${localeTypeName};
        }
    }
}

${content}`;
        writeFile(appDtsPath, newContent);
        return { file: 'src/app.d.ts' };
    }

    // Create new app.d.ts
    const content = `${localeType}

declare global {
    namespace App {
        interface Locals {
            locale: ${localeTypeName};
        }
        // interface Error {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
`;

    writeFile(appDtsPath, content);
    return { file: 'src/app.d.ts' };
}

// ============================================================================
// hooks.server.ts Generation
// ============================================================================

/**
 * Generates or patches hooks.server.ts
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateHooksServer(config) {
    const { cwd, defaultLanguage, languages, useMagicHook, isTypeScript } = config;

    const ext = isTypeScript ? 'ts' : 'js';
    const hooksPath = path.join(cwd, 'src', `hooks.server.${ext}`);

    // Also check for .js if looking for .ts and vice versa
    const altExt = isTypeScript ? 'js' : 'ts';
    const altHooksPath = path.join(cwd, 'src', `hooks.server.${altExt}`);

    const existingPath = fs.existsSync(hooksPath) ? hooksPath :
        fs.existsSync(altHooksPath) ? altHooksPath : null;

    const handleCode = useMagicHook
        ? generateMagicHookHandle(config)
        : generateSimpleHandle(config);

    if (existingPath) {
        // Patch existing hooks.server
        let content = fs.readFileSync(existingPath, 'utf8');

        // Check if already has i18n handle (check for both internal name and library import)
        if (content.includes('i18nHandle') ||
            content.includes('createI18nHook') ||
            content.includes('i18n-svelte-runes-lite') ||
            content.includes('locale-detection')) {
            return { file: null, error: 'hooks.server already has i18n configuration' };
        }

        createBackup(existingPath);

        // Check if has existing handle export
        // Match: export const handle, export let handle, export function handle
        // Also handles TypeScript annotations: export const handle: Handle
        // Also handles named exports: export { handle } or export { handle, ... }
        const hasDirectHandleExport = content.match(/export\s+(const|let|function)\s+handle\b/);
        const hasNamedHandleExport = content.match(/export\s*\{[^}]*\bhandle\b[^}]*\}/);
        const hasHandleExport = hasDirectHandleExport || hasNamedHandleExport;

        if (hasHandleExport) {
            // Need to use sequence
            const sequenceImport = `import { sequence } from '@sveltejs/kit/hooks';\n`;
            const i18nHandleCode = handleCode.replace('export const handle', 'const i18nHandle');

            // Check for value imports from @sveltejs/kit/hooks (not type-only imports)
            // Type-only imports look like: import type { Handle } from '@sveltejs/kit'
            const hasValueImportFromHooks = /import\s+\{[^}]+\}\s*from\s*['"]@sveltejs\/kit\/hooks['"]/.test(content) &&
                !/import\s+type\s+\{[^}]+\}\s*from\s*['"]@sveltejs\/kit\/hooks['"]/.test(content);

            // Check if 'sequence' is actually imported (not just mentioned in a comment/string)
            // Match: import { sequence } or import { ..., sequence } or import { sequence, ... }
            const hasSequenceImport = /import\s*\{[^}]*\bsequence\b[^}]*\}\s*from\s*['"]@sveltejs\/kit\/hooks['"]/.test(content);

            // Add sequence import if not present
            if (!hasValueImportFromHooks) {
                content = sequenceImport + content;
            } else if (!hasSequenceImport) {
                // File has value imports from kit/hooks but doesn't have sequence - need to add it
                // Handle both single-line and multi-line imports
                const importReplaced = content.replace(
                    /import\s*\{([^}]+)\}\s*from\s*['"]@sveltejs\/kit\/hooks['"]/,
                    (match, imports) => {
                        // Check if this is a type-only import
                        if (/import\s+type/.test(match)) {
                            return match; // Don't modify type-only imports
                        }
                        const cleanImports = imports.split(',').map(i => i.trim()).filter(Boolean);
                        cleanImports.push('sequence');
                        return `import { ${cleanImports.join(', ')} } from '@sveltejs/kit/hooks'`;
                    }
                );
                if (importReplaced === content) {
                    // Regex didn't match, add new import
                    content = sequenceImport + content;
                } else {
                    content = importReplaced;
                }
            }

            // Generate unique name for existing handle to avoid collisions
            let renamedHandle = 'existingHandle';
            let counter = 1;
            while (content.includes(renamedHandle)) {
                renamedHandle = `existingHandle${counter}`;
                counter++;
            }

            // Rename existing handle - preserve TypeScript type annotations
            // Matches: export const handle = ..., export const handle: Handle = ...
            // Also handles complex types like: Handle<Locals>, import('@sveltejs/kit').Handle
            content = content.replace(
                /export\s+(const|let)\s+handle\s*(:[^=]+)?=/,
                (match, constOrLet, typeAnnotation) => {
                    return `const ${renamedHandle}${typeAnnotation || ''} =`;
                }
            );
            content = content.replace(
                /export\s+function\s+handle\s*\(/,
                `function ${renamedHandle}(`
            );
            // Also handle async function declarations
            content = content.replace(
                /export\s+async\s+function\s+handle\s*\(/,
                `async function ${renamedHandle}(`
            );

            // Handle named exports: export { handle } or export { handle, other }
            // Remove 'handle' from the export list and rename the variable
            if (hasNamedHandleExport) {
                // First, rename the handle variable/function definition (not exported directly)
                content = content.replace(
                    /\b(const|let)\s+handle\s*(:[^=]+)?=/,
                    (match, constOrLet, typeAnnotation) => {
                        return `${constOrLet} ${renamedHandle}${typeAnnotation || ''} =`;
                    }
                );
                content = content.replace(
                    /\bfunction\s+handle\s*\(/,
                    `function ${renamedHandle}(`
                );
                content = content.replace(
                    /\basync\s+function\s+handle\s*\(/,
                    `async function ${renamedHandle}(`
                );

                // Remove 'handle' from the named export
                content = content.replace(
                    /export\s*\{([^}]*)\bhandle\b([^}]*)\}/,
                    (match, before, after) => {
                        // Clean up: remove handle and fix commas
                        let exports = (before + after)
                            .split(',')
                            .map(e => e.trim())
                            .filter(e => e && e !== 'handle');

                        if (exports.length === 0) {
                            return ''; // Remove entire export statement
                        }
                        return `export { ${exports.join(', ')} }`;
                    }
                );
            }

            // Add i18n handle and sequence
            content += `\n\n// i18n locale detection\n${i18nHandleCode}\n`;
            content += `\nexport const handle = sequence(i18nHandle, ${renamedHandle});\n`;

            writeFile(existingPath, content);
            return { file: `src/hooks.server.${path.extname(existingPath).slice(1)}` };
        }

        // No existing handle, just append
        content += `\n\n${handleCode}\n`;
        writeFile(existingPath, content);
        return { file: `src/hooks.server.${path.extname(existingPath).slice(1)}` };
    }

    // Create new hooks.server
    const content = `import type { Handle } from '@sveltejs/kit';

${handleCode}
`;

    writeFile(hooksPath, content);
    return { file: `src/hooks.server.${ext}` };
}

/**
 * Generates simple handle function for locale detection
 */
function generateSimpleHandle(config) {
    const { defaultLanguage, languages, isTypeScript } = config;

    return `// Locale detection handle
const supportedLocales = [${languages.map(l => `'${l}'`).join(', ')}]${isTypeScript ? ' as const' : ''};
const defaultLocale = '${defaultLanguage}';

export const handle${isTypeScript ? ': Handle' : ''} = async ({ event, resolve }) => {
    // Try to get locale from cookie
    let locale = event.cookies.get('locale');

    // Fallback to Accept-Language header
    if (!locale || !supportedLocales.includes(locale${isTypeScript ? ' as typeof supportedLocales[number]' : ''})) {
        const acceptLanguage = event.request.headers.get('accept-language');
        if (acceptLanguage) {
            const preferred = acceptLanguage.split(',')[0].split('-')[0];
            locale = supportedLocales.includes(preferred${isTypeScript ? ' as typeof supportedLocales[number]' : ''}) ? preferred : defaultLocale;
        } else {
            locale = defaultLocale;
        }
    }

    event.locals.locale = locale${isTypeScript ? ' as typeof supportedLocales[number]' : ''};

    return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%lang%', locale)
    });
};`;
}

/**
 * Generates magic hook handle using the library's server module
 * NOTE: The library exports createI18nHook, not createI18nHandle
 */
function generateMagicHookHandle(config) {
    const { defaultLanguage, languages } = config;

    return `import { createI18nHook } from 'i18n-svelte-runes-lite/server';

// Locale detection handle with magic hook
export const handle = createI18nHook({
    supportedLocales: [${languages.map(l => `'${l}'`).join(', ')}],
    fallbackLocale: '${defaultLanguage}'
});`;
}

// ============================================================================
// Layout Files Generation
// ============================================================================

/**
 * Generates +layout.server.ts
 *
 * NOTE: For namespaced mode, this also loads the default namespace translations
 * server-side and passes them to the client to avoid hydration mismatches.
 *
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateLayoutServer(config) {
    const { cwd, isTypeScript, useNamespaces, localesPath } = config;

    const ext = isTypeScript ? 'ts' : 'js';
    const layoutServerPath = path.join(cwd, 'src', 'routes', `+layout.server.${ext}`);

    // Calculate import path for the locales module
    const i18nImportPath = toSvelteKitAlias(path.dirname(localesPath) + '/locales');

    // Check for existing
    const altExt = isTypeScript ? 'js' : 'ts';
    const altPath = path.join(cwd, 'src', 'routes', `+layout.server.${altExt}`);

    const existingPath = fs.existsSync(layoutServerPath) ? layoutServerPath :
        fs.existsSync(altPath) ? altPath : null;

    if (existingPath) {
        let content = fs.readFileSync(existingPath, 'utf8');

        // Check if already returns locale
        if (content.includes('locale') && content.includes('locals')) {
            return { file: null, error: '+layout.server already returns locale' };
        }

        createBackup(existingPath);

        // Try to patch existing load function
        const loadMatch = content.match(/export\s+(const|function|async\s+function)\s+load/);

        if (loadMatch) {
            // Complex case - existing load function
            // Add locale to return
            // This is tricky, so we'll just warn
            const additionalReturn = useNamespaces
                ? '`locale: locals.locale, translations: { [locals.locale]: await loadLocale(locals.locale) }`'
                : '`locale: locals.locale`';
            return {
                file: null,
                error: `Please manually add ${additionalReturn} to your +layout.server load function return`
            };
        }

        // No load function, append one
        if (useNamespaces) {
            content = `import { loadLocale } from '${i18nImportPath}';\n` + content;
            content += `
export const load${isTypeScript ? ': import(\'./$types\').LayoutServerLoad' : ''} = async ({ locals }) => {
    // Load translations for the detected locale (namespaced mode)
    const translations = await loadLocale(locals.locale);
    return {
        locale: locals.locale,
        translations: { [locals.locale]: translations }
    };
};
`;
        } else {
            content += `
export const load${isTypeScript ? ': import(\'./$types\').LayoutServerLoad' : ''} = ({ locals }) => {
    return {
        locale: locals.locale
    };
};
`;
        }
        writeFile(existingPath, content);
        return { file: `src/routes/+layout.server.${path.extname(existingPath).slice(1)}` };
    }

    // Create new layout server
    let content;
    if (useNamespaces) {
        content = isTypeScript
            ? `import type { LayoutServerLoad } from './$types';
import { loadLocale } from '${i18nImportPath}';

export const load: LayoutServerLoad = async ({ locals }) => {
    // Load translations for the detected locale (namespaced mode)
    const namespaces = ['common'];
    const translations = await loadLocale(locals.locale, namespaces);
    return {
        locale: locals.locale,
        translations: { [locals.locale]: translations },
        loadedNamespaces: namespaces
    };
};
`
            : `import { loadLocale } from '${i18nImportPath}';

export const load = async ({ locals }) => {
    // Load translations for the detected locale (namespaced mode)
    const namespaces = ['common'];
    const translations = await loadLocale(locals.locale, namespaces);
    return {
        locale: locals.locale,
        translations: { [locals.locale]: translations },
        loadedNamespaces: namespaces
    };
};
`;
    } else {
        content = isTypeScript
            ? `import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
    return {
        locale: locals.locale
    };
};
`
            : `export const load = ({ locals }) => {
    return {
        locale: locals.locale
    };
};
`;
    }

    ensureDir(path.dirname(layoutServerPath));
    writeFile(layoutServerPath, content);
    return { file: `src/routes/+layout.server.${ext}` };
}

/**
 * Generates or patches +layout.svelte
 * Uses setI18n() context pattern (NOT I18nProvider - that doesn't exist)
 *
 * NOTE: This function branches based on config.useNamespaces:
 * - Bundled mode: imports `locales` object directly
 * - Namespaced mode: uses `loadLocale` for async loading
 *
 * @param {object} config - Generation config
 * @returns {{ file: string | null, error?: string }}
 */
function generateLayoutSvelte(config) {
    const { cwd, isTypeScript, localesPath, useNamespaces } = config;

    const layoutPath = path.join(cwd, 'src', 'routes', '+layout.svelte');

    // Calculate the import path for the locales module
    // The locales index file (locales.ts) is created in the parent directory of localesPath
    // e.g., localesPath 'src/lib/i18n/locales' -> index at 'src/lib/i18n/locales.ts' -> import '$lib/i18n/locales'
    // e.g., localesPath 'src/translations/data' -> index at 'src/translations/locales.ts' -> import '../translations/locales'
    const i18nImportPath = toSvelteKitAlias(path.dirname(localesPath) + '/locales');

    if (fs.existsSync(layoutPath)) {
        let content = fs.readFileSync(layoutPath, 'utf8');

        // Check if already has i18n
        if (content.includes('i18n-svelte-runes-lite') || content.includes('setI18n')) {
            return { file: null, error: '+layout.svelte already has i18n configuration' };
        }

        createBackup(layoutPath);

        // Try to patch - add setI18n call
        // This is complex, so we'll provide a template and warn
        // Template differs based on bundled vs namespaced mode
        const manualInstructions = useNamespaces
            ? `Please manually update +layout.svelte. Add:
  <script>
    import { setI18n } from 'i18n-svelte-runes-lite';
    import { defaultLocale, loadLocale } from '${i18nImportPath}';
    let { data, children } = $props();

    // For namespaced mode:
    // - SSR: translations are loaded in +layout.server.ts and passed via data.translations
    // - Client: onLocaleChange hook loads translations dynamically when locale changes
    setI18n({
        translations: data.translations ?? {},
        initialLocale: data.locale ?? defaultLocale,
        ssrLoadedNamespaces: data.loadedNamespaces
            ? { [data.locale]: data.loadedNamespaces }
            : undefined,
        onLocaleChange: async (newLocale) => {
            const namespaces = data.loadedNamespaces ?? ['common'];
            return await loadLocale(newLocale, namespaces);
        }
    });
  </script>

  {@render children()}`
            : `Please manually update +layout.svelte. Add:
  <script>
    import { setI18n } from 'i18n-svelte-runes-lite';
    import { locales, defaultLocale } from '${i18nImportPath}';
    let { data, children } = $props();

    setI18n({
        translations: locales,
        initialLocale: data.locale ?? defaultLocale
    });
  </script>

  {@render children()}`;

        return {
            file: null,
            error: manualInstructions
        };
    }

    // Create new layout.svelte using setI18n pattern
    const scriptLang = isTypeScript ? ' lang="ts"' : '';

    let content;
    if (useNamespaces) {
        // Namespaced mode: translations loaded async, uses onLocaleChange hook for dynamic loading
        content = `<script${scriptLang}>
    import { setI18n } from 'i18n-svelte-runes-lite';
    import { defaultLocale, loadLocale } from '${i18nImportPath}';

    let { data, children } = $props();

    // Initialize i18n context for the component tree
    // For namespaced mode:
    // - SSR: translations are loaded in +layout.server.ts and passed via data.translations
    // - Client: onLocaleChange hook loads translations dynamically when locale changes
    setI18n({
        translations: data.translations ?? {},
        initialLocale: data.locale ?? defaultLocale,
        // SSR tracking - prevents isNamespaceLoaded('common') returning false on hydration
        ssrLoadedNamespaces: data.loadedNamespaces
            ? { [data.locale]: data.loadedNamespaces }
            : undefined,
        // Hook called when locale changes - loads translations dynamically
        onLocaleChange: async (newLocale) => {
            const namespaces = data.loadedNamespaces ?? ['common'];
            return await loadLocale(newLocale, namespaces);
        }
    });
</script>

{@render children()}
`;
    } else {
        // Bundled mode: translations imported directly
        content = `<script${scriptLang}>
    import { setI18n } from 'i18n-svelte-runes-lite';
    import { locales, defaultLocale } from '${i18nImportPath}';

    let { data, children } = $props();

    // Initialize i18n context for the component tree
    setI18n({
        translations: locales,
        initialLocale: data.locale ?? defaultLocale
    });
</script>

{@render children()}
`;
    }

    ensureDir(path.dirname(layoutPath));
    writeFile(layoutPath, content);
    return { file: 'src/routes/+layout.svelte' };
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generates all SvelteKit i18n files
 * @param {object} config - Generation config
 * @returns {Promise<{ files: string[], errors: string[] }>}
 */
export async function generateSvelteKit(config) {
    const files = [];
    const errors = [];

    // Generate app.d.ts
    const appDtsResult = generateAppDts(config);
    if (appDtsResult.file) files.push(appDtsResult.file);
    if (appDtsResult.error) errors.push(appDtsResult.error);

    // Generate hooks.server.ts
    const hooksResult = generateHooksServer(config);
    if (hooksResult.file) files.push(hooksResult.file);
    if (hooksResult.error) errors.push(hooksResult.error);

    // Generate +layout.server.ts
    const layoutServerResult = generateLayoutServer(config);
    if (layoutServerResult.file) files.push(layoutServerResult.file);
    if (layoutServerResult.error) errors.push(layoutServerResult.error);

    // Generate +layout.svelte
    const layoutSvelteResult = generateLayoutSvelte(config);
    if (layoutSvelteResult.file) files.push(layoutSvelteResult.file);
    if (layoutSvelteResult.error) errors.push(layoutSvelteResult.error);

    return { files, errors };
}
