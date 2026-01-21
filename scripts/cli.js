#!/usr/bin/env node

/**
 * i18n-svelte-runes-lite Interactive Scaffolding CLI
 *
 * Sets up i18n configuration for Svelte/SvelteKit projects.
 * Zero dependencies - uses Node's built-in readline.
 *
 * Features:
 * - Atomic transactions with rollback on failure
 * - SIGINT (Ctrl+C) handling
 * - Project root validation
 *
 * Usage:
 *   npx i18n-runes init
 *   node scripts/cli.js init
 *
 * Environment Variables:
 *   I18N_YES=1  - Skip prompts and use defaults (for CI)
 */

import readline from 'readline';
import { detect, detectMonorepo } from './cli/detect.js';
import { generateSvelteKit } from './cli/generators/sveltekit.js';
import { generateWails } from './cli/generators/wails.js';
import { generateSPA } from './cli/generators/spa.js';
import { patchViteConfig, createLocaleFiles, createLocalesIndex } from './cli/generators/shared.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Terminal Styling (ANSI codes with NO_COLOR support)
// ============================================================================

// Respect NO_COLOR standard (https://no-color.org/) and non-TTY environments
const useColors = process.stdout.isTTY && !process.env.NO_COLOR;

const styles = useColors ? {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
} : {
    reset: '',
    bold: '',
    dim: '',
    green: '',
    yellow: '',
    blue: '',
    cyan: '',
    red: ''
};

const log = {
    info: (msg) => console.log(`${styles.cyan}ℹ${styles.reset} ${msg}`),
    success: (msg) => console.log(`${styles.green}✓${styles.reset} ${msg}`),
    warn: (msg) => console.log(`${styles.yellow}⚠${styles.reset} ${msg}`),
    error: (msg) => console.log(`${styles.red}✗${styles.reset} ${msg}`),
    step: (msg) => console.log(`${styles.blue}→${styles.reset} ${msg}`)
};

// ============================================================================
// Rollback Manager - Atomic Transaction Support
// ============================================================================

class RollbackManager {
    constructor(cwd) {
        this.cwd = cwd;
        this.snapshots = new Map();  // path -> original content (null if didn't exist)
        this.createdDirs = new Set(); // directories that were actually created by the script
        this.preExistingDirs = new Set(); // directories that existed before the script ran
        this.isRollingBack = false;
    }

    /**
     * Take a snapshot of files that might be modified
     * Call this BEFORE running generators
     */
    snapshot(relativePaths) {
        for (const relPath of relativePaths) {
            const fullPath = path.join(this.cwd, relPath);
            if (fs.existsSync(fullPath)) {
                // File exists - save its content
                this.snapshots.set(relPath, fs.readFileSync(fullPath, 'utf8'));
            } else {
                // File doesn't exist - mark as new (will be deleted on rollback)
                this.snapshots.set(relPath, null);
            }

            // Track pre-existing directories in the path
            let dir = path.dirname(relPath);
            while (dir && dir !== '.' && dir !== '/') {
                const fullDirPath = path.join(this.cwd, dir);
                if (fs.existsSync(fullDirPath)) {
                    this.preExistingDirs.add(dir);
                }
                dir = path.dirname(dir);
            }
        }
    }

    /**
     * Track a file that was created/modified during generation
     * Call this AFTER a file is written
     */
    track(relativePath) {
        if (!this.snapshots.has(relativePath)) {
            // New file we didn't snapshot - mark for deletion on rollback
            this.snapshots.set(relativePath, null);
        }

        // Track parent directories that may have been created by the script
        // Only track directories that didn't exist before we started
        let dir = path.dirname(relativePath);
        while (dir && dir !== '.' && dir !== '/') {
            // Only track if it wasn't pre-existing
            if (!this.preExistingDirs.has(dir)) {
                this.createdDirs.add(dir);
            }
            dir = path.dirname(dir);
        }
    }

    /**
     * Rollback all changes to their original state
     */
    rollback() {
        if (this.isRollingBack) return;
        this.isRollingBack = true;

        console.log(`\n${styles.red}${styles.bold}Rolling back changes...${styles.reset}`);

        let restored = 0;
        let deleted = 0;

        for (const [relPath, originalContent] of this.snapshots) {
            const fullPath = path.join(this.cwd, relPath);

            try {
                if (originalContent === null) {
                    // File was newly created - delete it
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        deleted++;
                    }
                } else {
                    // File was modified - restore original content
                    fs.writeFileSync(fullPath, originalContent, 'utf8');
                    restored++;
                }
            } catch (e) {
                // Log but continue rolling back other files
                log.warn(`Could not rollback ${relPath}: ${e.message}`);
            }
        }

        // Clean up empty directories created by the script
        this.cleanupEmptyDirs();

        if (restored > 0 || deleted > 0) {
            log.info(`Restored ${restored} file(s), deleted ${deleted} new file(s)`);
        }

        // Clean up .bak files created by generators
        this.cleanupBackups();
    }

    /**
     * Remove empty directories that may have been created
     * Processes deepest directories first to handle nested empty dirs
     */
    cleanupEmptyDirs() {
        // Sort directories by depth (deepest first) to clean up nested empty dirs properly
        const sortedDirs = Array.from(this.createdDirs).sort((a, b) => {
            const depthA = a.split(path.sep).length;
            const depthB = b.split(path.sep).length;
            return depthB - depthA;  // Deepest first
        });

        for (const dir of sortedDirs) {
            const fullPath = path.join(this.cwd, dir);
            try {
                if (fs.existsSync(fullPath)) {
                    const files = fs.readdirSync(fullPath);
                    if (files.length === 0) {
                        fs.rmdirSync(fullPath);
                    }
                }
            } catch {
                // Ignore - directory not empty or doesn't exist
            }
        }
    }

    /**
     * Clean up .bak files created by generators
     */
    cleanupBackups() {
        for (const relPath of this.snapshots.keys()) {
            const bakPath = path.join(this.cwd, relPath + '.bak');
            try {
                if (fs.existsSync(bakPath)) {
                    fs.unlinkSync(bakPath);
                }
            } catch {
                // Ignore
            }
        }
    }

    /**
     * Success - clean up backup files only
     */
    commit() {
        this.cleanupBackups();
    }
}

// Global rollback manager for SIGINT handling
let activeRollback = null;

// ============================================================================
// CLI Prompts (zero-dependency)
// ============================================================================

function createPrompt() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let isClosed = false;

    return {
        async text(message, defaultValue = '') {
            return new Promise((resolve) => {
                const hint = defaultValue ? ` ${styles.dim}(${defaultValue})${styles.reset}` : '';
                rl.question(`${styles.cyan}?${styles.reset} ${message}${hint}: `, (answer) => {
                    resolve(answer.trim() || defaultValue);
                });
            });
        },

        async select(message, options, defaultIndex = 0) {
            console.log(`\n${styles.cyan}?${styles.reset} ${message}`);
            options.forEach((opt, i) => {
                const marker = i === defaultIndex ? `${styles.green}>${styles.reset}` : ' ';
                const hint = opt.hint ? ` ${styles.dim}(${opt.hint})${styles.reset}` : '';
                console.log(`  ${marker} ${i + 1}. ${opt.label}${hint}`);
            });

            return new Promise((resolve) => {
                rl.question(`${styles.dim}Enter number [${defaultIndex + 1}]:${styles.reset} `, (answer) => {
                    const num = parseInt(answer, 10);
                    if (num >= 1 && num <= options.length) {
                        resolve(options[num - 1].value);
                    } else {
                        resolve(options[defaultIndex].value);
                    }
                });
            });
        },

        async confirm(message, defaultValue = true) {
            const hint = defaultValue ? 'Y/n' : 'y/N';
            return new Promise((resolve) => {
                rl.question(`${styles.cyan}?${styles.reset} ${message} ${styles.dim}(${hint})${styles.reset}: `, (answer) => {
                    if (!answer.trim()) {
                        resolve(defaultValue);
                    } else {
                        resolve(answer.toLowerCase().startsWith('y'));
                    }
                });
            });
        },

        close() {
            if (!isClosed) {
                isClosed = true;
                rl.close();
            }
        }
    };
}

// ============================================================================
// CLI Commands
// ============================================================================

function showHelp() {
    console.log(`
${styles.bold}i18n-svelte-runes-lite CLI${styles.reset}

${styles.bold}Usage:${styles.reset}
  i18n-runes <command>

${styles.bold}Commands:${styles.reset}
  init    Initialize i18n configuration in your project
  help    Show this help message

${styles.bold}Examples:${styles.reset}
  npx i18n-runes init
  I18N_YES=1 npx i18n-runes init   # Non-interactive mode
`);
}

// ============================================================================
// Non-interactive Mode
// ============================================================================

function isNonInteractive() {
    return process.env.I18N_YES === '1' || process.env.CI === 'true';
}

// ============================================================================
// Project Validation
// ============================================================================

function validateProjectRoot(cwd) {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        throw new Error(
            'No package.json found in current directory.\n' +
            '  Please run this command from the root of your project.'
        );
    }
}

/**
 * Get list of files that might be modified based on framework
 */
function getPotentialFiles(framework, isTypeScript, localesPath) {
    const ext = isTypeScript ? 'ts' : 'js';
    // SvelteKit uses locales.ts, SPA/Wails uses index.ts
    const indexFileName = framework === 'sveltekit' ? `locales.${ext}` : `index.${ext}`;
    const files = [
        // Shared files
        `vite.config.${ext}`,
        `vite.config.${isTypeScript ? 'js' : 'ts'}`,  // Check both extensions
        // Locale files
        path.join(localesPath, 'en.json'),
        path.join(path.dirname(localesPath), indexFileName),
    ];

    if (framework === 'sveltekit') {
        files.push(
            `src/app.d.ts`,
            `src/hooks.server.${ext}`,
            `src/hooks.server.${isTypeScript ? 'js' : 'ts'}`,
            `src/routes/+layout.server.${ext}`,
            `src/routes/+layout.svelte`
        );
    } else {
        files.push(
            'src/App.svelte',
            `src/main.${ext}`,
            'index.html'
        );
        // NOTE: We no longer generate persist.ts for Wails - library handles persistence
    }

    return files;
}

// ============================================================================
// Init Command
// ============================================================================

async function runInit() {
    console.log(`\n${styles.bold}${styles.cyan}i18n-svelte-runes-lite setup${styles.reset}\n`);

    const cwd = process.cwd();
    const prompt = createPrompt();

    // Initialize rollback manager early to handle SIGINT during any phase
    // Snapshots will be added later before files are modified
    const rollback = new RollbackManager(cwd);
    activeRollback = rollback;

    // Validate project root first
    try {
        validateProjectRoot(cwd);
    } catch (e) {
        log.error(e.message);
        activeRollback = null;
        process.exit(1);
    }

    // Check for ESM compatibility (Svelte 5 Runes require ESM)
    try {
        const pkgPath = path.join(cwd, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.type !== 'module') {
            log.warn('package.json is missing "type": "module". Svelte 5 Runes require ESM.');
            log.warn('Consider adding "type": "module" to your package.json');
        }
    } catch {
        // Ignore - validateProjectRoot already checks for package.json
    }

    // Check if running in a monorepo root (common mistake)
    const monorepoCheck = detectMonorepo(cwd);
    if (monorepoCheck.isMonorepo && monorepoCheck.root === cwd) {
        log.warn('You appear to be in a monorepo root directory.');
        log.warn('Consider running this command from a specific package folder instead.');
    }

    try {
        // Step 1: Detect project type
        const detection = detect(cwd);

        let framework = detection.framework;
        let displayName = detection.displayName;
        let isTypeScript = detection.isTypeScript;

        log.info(`Detected: ${styles.bold}${displayName}${styles.reset} (${isTypeScript ? 'TypeScript' : 'JavaScript'})`);

        if (!isNonInteractive()) {
            // Confirm or override detection
            const selection = await prompt.select(
                `Is this correct?`,
                [
                    { value: framework, label: `Yes, use ${displayName}`, hint: 'detected' },
                    { value: 'sveltekit', label: 'SvelteKit', hint: 'SSR + routing' },
                    { value: 'desktop', label: 'Desktop App', hint: 'Tauri, Wails, Electron' },
                    { value: 'spa', label: 'SPA', hint: 'Vite + Svelte only' }
                ],
                0
            );
            framework = selection;
        }

        // Step 2: Get configuration
        let languages = ['en'];
        let localesPath = 'src/lib/i18n/locales';
        // SvelteKit defaults to namespaced structure for better SSR support
        let useNamespaces = framework === 'sveltekit';
        let useMagicHook = framework === 'sveltekit';

        if (!isNonInteractive()) {
            // Languages - with validation and re-prompt loop
            let languagesValid = false;
            while (!languagesValid) {
                const languagesInput = await prompt.text(
                    'Languages to support (comma-separated BCP-47 codes, first = default)',
                    'en'
                );
                languages = languagesInput.split(',').map(l => l.trim()).filter(Boolean);

                if (languages.length === 0) {
                    languages = ['en'];
                    languagesValid = true;
                    continue;
                }

                // Validate language codes (BCP-47 compatible)
                // Allows: en, en-US, en-us, zh-Hans, fil (3-letter codes)
                const validLangs = languages.filter(l => /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(l));
                const invalidLangs = languages.filter(l => !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(l));

                if (invalidLangs.length > 0) {
                    // Show which codes were invalid
                    log.error(`Invalid language code(s): ${invalidLangs.join(', ')}`);
                    log.info('Use BCP-47 format: en, en-US, pl, de, zh-Hans, etc.');

                    if (validLangs.length === 0) {
                        // ALL codes invalid - re-prompt
                        log.warn('No valid language codes provided. Please try again.');
                        continue;
                    } else {
                        // Some valid, some invalid - ask if they want to continue with valid ones
                        const continueWithValid = await prompt.confirm(
                            `Continue with valid codes only? (${validLangs.join(', ')})`,
                            true
                        );
                        if (continueWithValid) {
                            languages = validLangs;
                            languagesValid = true;
                        }
                        // If not, loop will re-prompt
                    }
                } else {
                    // All codes valid
                    languages = validLangs;
                    languagesValid = true;
                }
            }

            // Locales path
            localesPath = await prompt.text(
                'Path for locale files',
                'src/lib/i18n/locales'
            );

            // Structure (SvelteKit defaults to namespaced for SSR benefits)
            const structureDefaultIndex = framework === 'sveltekit' ? 1 : 0;

            const structureChoice = await prompt.select(
                'Translation file structure:',
                [
                    { value: 'bundled', label: 'Bundled', hint: 'en.json, pl.json' },
                    { value: 'namespaced', label: 'Namespaced', hint: 'en/common.json, en/auth.json (recommended for SSR)' }
                ],
                structureDefaultIndex
            );
            useNamespaces = structureChoice === 'namespaced';

            // Magic hook (SvelteKit only)
            if (framework === 'sveltekit') {
                useMagicHook = await prompt.confirm(
                    'Use Magic Hook for automatic locale detection?',
                    true
                );
            }
        }

        // Step 3: Check for existing files
        const existingI18nDir = path.join(cwd, path.dirname(localesPath));
        if (fs.existsSync(existingI18nDir)) {
            if (!isNonInteractive()) {
                const overwrite = await prompt.confirm(
                    `Directory ${path.dirname(localesPath)} already exists. Continue anyway?`,
                    false
                );

                if (!overwrite) {
                    log.warn('Setup cancelled to preserve existing files.');
                    prompt.close();
                    process.exit(0);
                }
            }
        }

        prompt.close();

        // Step 4: Snapshot existing files before modification
        // (rollback manager was initialized at the start of runInit)

        // Snapshot files that might be modified
        const potentialFiles = getPotentialFiles(framework, isTypeScript, localesPath);
        rollback.snapshot(potentialFiles);

        // Also snapshot locale files for all languages
        for (const lang of languages) {
            if (useNamespaces) {
                rollback.snapshot([path.join(localesPath, lang, 'common.json')]);
            } else {
                rollback.snapshot([path.join(localesPath, `${lang}.json`)]);
            }
        }

        console.log(`\n${styles.dim}Generating configuration files...${styles.reset}\n`);

        const config = {
            cwd,
            framework,
            languages,
            defaultLanguage: languages[0],
            localesPath,
            useNamespaces,
            useMagicHook,
            isTypeScript
        };

        const generatedFiles = [];
        const errors = [];

        // Generate files (wrapped in try-catch for rollback)
        try {
            // Always patch vite config
            const viteResult = await patchViteConfig(config);
            if (viteResult.success) {
                generatedFiles.push(viteResult.file);
                rollback.track(viteResult.file);
            } else if (viteResult.error) {
                errors.push(viteResult.error);
            }

            // Create locale files
            const localeResult = await createLocaleFiles(config);
            for (const file of localeResult.files) {
                generatedFiles.push(file);
                rollback.track(file);
            }

            // Create locales index
            const indexResult = await createLocalesIndex(config);
            if (indexResult.file) {
                generatedFiles.push(indexResult.file);
                rollback.track(indexResult.file);
            }

            // Framework-specific generation
            let frameworkResult;
            switch (framework) {
                case 'sveltekit':
                    frameworkResult = await generateSvelteKit(config);
                    break;
                case 'desktop':
                    // Desktop apps (Wails, Tauri, Electron) use the same generator
                    frameworkResult = await generateWails(config);
                    break;
                case 'spa':
                default:
                    frameworkResult = await generateSPA(config);
                    break;
            }

            for (const file of frameworkResult.files) {
                generatedFiles.push(file);
                rollback.track(file);
            }
            if (frameworkResult.errors) {
                errors.push(...frameworkResult.errors);
            }

        } catch (e) {
            // Generation failed - rollback all changes
            rollback.rollback();
            activeRollback = null;
            throw e;
        }

        // Success - clean up backups
        rollback.commit();
        activeRollback = null;

        // Step 5: Summary
        console.log(`${styles.bold}Files created/modified:${styles.reset}`);
        for (const file of generatedFiles) {
            log.success(file);
        }

        if (errors.length > 0) {
            console.log(`\n${styles.bold}${styles.yellow}Warnings:${styles.reset}`);
            for (const error of errors) {
                log.warn(error);
            }
        }

        // Step 6: Next steps
        const exampleImport = framework === 'sveltekit'
            ? "import { useI18n } from 'i18n-svelte-runes-lite/context';\n    const i18n = useI18n();\n    const { t, setLocale } = i18n;  // Functions safe to destructure"
            : "import { i18n, t, setLocale } from '$lib/i18n';";

        console.log(`
${styles.bold}${styles.cyan}Next steps:${styles.reset}

  1. Review the generated files
  2. Add translations to your locale files
  3. Import and use t() in your components

  ${styles.bold}Example usage:${styles.reset}
    ${exampleImport}

    <p>{t('hello')}</p>
    <p>Current: {i18n.locale}</p>  <!-- Use i18n.locale for reactivity! -->

${styles.green}✓${styles.reset} Setup complete!
`);

    } catch (e) {
        prompt.close();
        log.error(e.message);
        process.exit(1);
    }
}

// ============================================================================
// SIGINT Handler (Ctrl+C)
// ============================================================================

process.on('SIGINT', () => {
    console.log('\n');
    log.warn('Interrupted by user');

    if (activeRollback) {
        activeRollback.rollback();
    }

    process.exit(130);  // Standard exit code for SIGINT
});

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'init':
            await runInit();
            break;
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
        default:
            if (command) {
                console.error(`Unknown command: ${command}\n`);
            }
            showHelp();
            process.exit(command ? 1 : 0);
    }
}

main().catch((e) => {
    log.error(`Fatal error: ${e.message}`);

    if (activeRollback) {
        activeRollback.rollback();
    }

    process.exit(1);
});
