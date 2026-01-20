/**
 * Project Type Detection
 *
 * Detects the type of Svelte project based on file structure and config files.
 */

import fs from 'fs';
import path from 'path';

/**
 * @typedef {'sveltekit' | 'desktop' | 'spa'} FrameworkType
 */

/**
 * @typedef {Object} DetectionResult
 * @property {FrameworkType} framework - Detected framework type (internal identifier)
 * @property {string} displayName - Human-readable framework name (e.g., 'SvelteKit', 'Tauri', 'Wails')
 * @property {boolean} isTypeScript - Whether the project uses TypeScript
 * @property {string[]} evidence - Files/configs that led to the detection
 */

/**
 * Checks if a file exists
 * @param {string} cwd - Current working directory
 * @param {string} relativePath - Relative path to check
 * @returns {boolean}
 */
function fileExists(cwd, relativePath) {
    return fs.existsSync(path.join(cwd, relativePath));
}

/**
 * Reads package.json if it exists
 * @param {string} cwd - Current working directory
 * @returns {object | null}
 */
function readPackageJson(cwd) {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Detects if the project is a SvelteKit project
 * @param {string} cwd - Current working directory
 * @returns {{ detected: boolean, evidence: string[] }}
 */
function detectSvelteKit(cwd) {
    const evidence = [];

    // Check for svelte.config.js/ts
    if (fileExists(cwd, 'svelte.config.js') || fileExists(cwd, 'svelte.config.ts')) {
        evidence.push('svelte.config.js/ts');
    }

    // Check for src/routes directory
    if (fileExists(cwd, 'src/routes')) {
        evidence.push('src/routes/');
    }

    // Check for @sveltejs/kit in dependencies
    const pkg = readPackageJson(cwd);
    if (pkg) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@sveltejs/kit']) {
            evidence.push('@sveltejs/kit dependency');
        }
    }

    // Need at least 2 pieces of evidence for SvelteKit
    return {
        detected: evidence.length >= 2,
        evidence
    };
}

/**
 * Detects if the project is a Desktop app (Wails, Tauri, or Electron)
 * @param {string} cwd - Current working directory
 * @returns {{ detected: boolean, evidence: string[], displayName: string }}
 */
function detectDesktop(cwd) {
    const evidence = [];
    let displayName = 'Desktop'; // Default display name

    // Check for wails.json
    if (fileExists(cwd, 'wails.json')) {
        evidence.push('wails.json');
        displayName = 'Wails';
    }

    // Check parent directory for wails.json (frontend is often a subdirectory)
    const parentWails = path.join(cwd, '..', 'wails.json');
    if (fs.existsSync(parentWails)) {
        evidence.push('../wails.json');
        displayName = 'Wails';
    }

    // Check for Tauri config
    if (fileExists(cwd, 'src-tauri') || fileExists(cwd, 'src-tauri/tauri.conf.json')) {
        evidence.push('src-tauri/');
        displayName = 'Tauri';
    }

    // Check for Tauri in Cargo.toml (could be in parent)
    if (fileExists(cwd, 'Cargo.toml')) {
        try {
            const cargo = fs.readFileSync(path.join(cwd, 'Cargo.toml'), 'utf8');
            if (cargo.includes('tauri')) {
                evidence.push('tauri in Cargo.toml');
                displayName = 'Tauri';
            }
        } catch {
            // Ignore read errors
        }
    }

    // Check for @tauri-apps/api in dependencies
    const pkg = readPackageJson(cwd);
    if (pkg) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@tauri-apps/api'] || deps['@tauri-apps/cli']) {
            evidence.push('@tauri-apps dependency');
            displayName = 'Tauri';
        }
        // Check for Electron
        if (deps['electron'] || deps['electron-builder']) {
            evidence.push('electron dependency');
            displayName = 'Electron';
        }
    }

    return {
        detected: evidence.length >= 1,
        evidence,
        displayName
    };
}

/**
 * Detects if the project uses TypeScript
 * @param {string} cwd - Current working directory
 * @returns {boolean}
 */
function detectTypeScript(cwd) {
    // Check for tsconfig.json (definitive indicator)
    if (fileExists(cwd, 'tsconfig.json')) {
        return true;
    }

    // Check for svelte.config.ts (definitive indicator for SvelteKit TypeScript projects)
    if (fileExists(cwd, 'svelte.config.ts')) {
        return true;
    }

    // Check for vite.config.ts
    if (fileExists(cwd, 'vite.config.ts')) {
        return true;
    }

    // Check for .ts files in src
    const srcDir = path.join(cwd, 'src');
    if (fs.existsSync(srcDir)) {
        try {
            const files = fs.readdirSync(srcDir);
            if (files.some(f => f.endsWith('.ts') || f.endsWith('.svelte.ts'))) {
                return true;
            }
        } catch {
            // Ignore read errors
        }
    }

    return false;
}

/**
 * Detects the project type and configuration
 * @param {string} cwd - Current working directory
 * @returns {DetectionResult}
 */
export function detect(cwd) {
    const evidence = [];

    // Check for SvelteKit first (most specific)
    const sveltekit = detectSvelteKit(cwd);
    if (sveltekit.detected) {
        return {
            framework: 'sveltekit',
            displayName: 'SvelteKit',
            isTypeScript: detectTypeScript(cwd),
            evidence: sveltekit.evidence
        };
    }

    // Check for Desktop apps (Wails/Tauri/Electron)
    const desktop = detectDesktop(cwd);
    if (desktop.detected) {
        return {
            framework: 'desktop',
            displayName: desktop.displayName,
            isTypeScript: detectTypeScript(cwd),
            evidence: desktop.evidence
        };
    }

    // Default to SPA
    // Check for basic Svelte/Vite setup
    if (fileExists(cwd, 'vite.config.js') || fileExists(cwd, 'vite.config.ts')) {
        evidence.push('vite.config.js/ts');
    }
    if (fileExists(cwd, 'src/App.svelte') || fileExists(cwd, 'src/main.ts') || fileExists(cwd, 'src/main.js')) {
        evidence.push('src/App.svelte or main entry');
    }

    const pkg = readPackageJson(cwd);
    if (pkg) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['svelte']) {
            evidence.push('svelte dependency');
        }
        if (deps['vite'] || deps['@sveltejs/vite-plugin-svelte']) {
            evidence.push('vite/svelte-vite-plugin dependency');
        }
    }

    return {
        framework: 'spa',
        displayName: 'SPA',
        isTypeScript: detectTypeScript(cwd),
        evidence: evidence.length > 0 ? evidence : ['default fallback']
    };
}

/**
 * Detects if project is in a monorepo
 * @param {string} cwd - Current working directory
 * @returns {{ isMonorepo: boolean, root: string | null }}
 */
export function detectMonorepo(cwd) {
    let current = cwd;
    const root = path.parse(cwd).root;

    while (current !== root) {
        const parent = path.dirname(current);

        // Check for common monorepo indicators
        if (fileExists(parent, 'pnpm-workspace.yaml') ||
            fileExists(parent, 'lerna.json') ||
            fileExists(parent, 'nx.json')) {
            return { isMonorepo: true, root: parent };
        }

        // Check for workspaces in package.json
        const pkg = readPackageJson(parent);
        if (pkg && pkg.workspaces) {
            return { isMonorepo: true, root: parent };
        }

        current = parent;
    }

    return { isMonorepo: false, root: null };
}
