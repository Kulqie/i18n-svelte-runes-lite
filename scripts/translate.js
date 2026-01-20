#!/usr/bin/env node

/**
 * i18n Translation Sync Script
 *
 * Synchronizes translation files using an OpenAI-compatible API.
 * Supports local LLM servers (Ollama, etc.) and cloud providers.
 *
 * Usage:
 *   npx i18n-translate
 *   node translate.js --locales ./src/locales --source en --target pl
 *
 * Environment Variables (loaded from .env automatically):
 *   OPENAI_API_KEY    - API key for the LLM provider (required)
 *   OPENAI_BASE_URL   - Base URL for the API (optional)
 *   OPENAI_MODEL      - Model to use (optional)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

// ============================================================================
// .env File Loader (zero dependencies)
// ============================================================================

/**
 * Load environment variables from .env file
 * Searches for .env in current directory and parents
 */
function loadEnvFile() {
    const envPaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '.env.local'),
    ];

    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf8');
                for (const line of content.split('\n')) {
                    const trimmed = line.trim();
                    // Skip comments and empty lines
                    if (!trimmed || trimmed.startsWith('#')) continue;

                    const eqIndex = trimmed.indexOf('=');
                    if (eqIndex > 0) {
                        const key = trimmed.slice(0, eqIndex).trim();
                        let value = trimmed.slice(eqIndex + 1).trim();
                        // Remove quotes if present
                        if ((value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        // Only set if not already defined (CLI env vars take precedence)
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                }
            } catch {
                // Ignore read errors
            }
            break; // Stop after first .env found
        }
    }
}

// Load .env before anything else
loadEnvFile();

// ============================================================================
// Configuration
// ============================================================================

const DEFAULTS = {
    localesDir: null,
    sourceLang: 'en',
    batchSize: 20,
    sortKeys: true,  // Set to false to preserve key order/grouping
    api: {
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini'
    }
};

/**
 * Detects the locales directory by searching common paths
 */
function detectLocalesDir() {
    const candidates = [
        'src/lib/i18n/locales',
        'src/locales',
        'locales',
        'src/i18n/locales',
        'src/lib/locales',
        'i18n/locales',
        'lang',
        'languages'
    ];

    for (const candidate of candidates) {
        const fullPath = path.resolve(process.cwd(), candidate);
        if (fs.existsSync(fullPath)) {
            try {
                const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.json'));
                if (files.length > 0) {
                    return fullPath;
                }
            } catch {
                // Continue to next candidate
            }
        }
    }
    return null;
}

/**
 * Loads configuration from multiple sources with priority:
 * 1. CLI arguments (highest)
 * 2. i18n.config.json
 * 3. package.json "i18n" field
 * 4. Defaults + auto-detection
 */
function loadConfig(cliOptions = {}) {
    let config = { ...DEFAULTS };

    // Apply environment variables
    if (process.env.OPENAI_BASE_URL) {
        config.api.url = process.env.OPENAI_BASE_URL;
    }
    if (process.env.OPENAI_MODEL) {
        config.api.model = process.env.OPENAI_MODEL;
    }

    // Check i18n.config.json
    const configPath = path.resolve(process.cwd(), 'i18n.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = mergeConfig(config, fileConfig);
            console.log('Loaded config from i18n.config.json');
        } catch (e) {
            console.warn('Warning: Failed to parse i18n.config.json:', e.message);
        }
    } else {
        // Check package.json "i18n" field
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg.i18n) {
                    config = mergeConfig(config, pkg.i18n);
                    console.log('Loaded config from package.json "i18n" field');
                }
            } catch {
                // Ignore package.json errors
            }
        }
    }

    // Apply CLI options (highest priority)
    if (cliOptions.localesDir) config.localesDir = cliOptions.localesDir;
    if (cliOptions.sourceLang) config.sourceLang = cliOptions.sourceLang;
    if (cliOptions.batchSize) config.batchSize = cliOptions.batchSize;

    // Auto-detect localesDir if not set
    if (!config.localesDir) {
        config.localesDir = detectLocalesDir();
    }

    // Resolve localesDir to absolute path
    if (config.localesDir && !path.isAbsolute(config.localesDir)) {
        config.localesDir = path.resolve(process.cwd(), config.localesDir);
    }

    return config;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
        if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
            result[key] = mergeConfig(base[key] || {}, override[key]);
        } else {
            result[key] = override[key];
        }
    }
    return result;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        localesDir: null,
        sourceLang: null,
        targetLang: null,
        dryRun: false,
        noBackup: false,
        noSort: false,
        verbose: false,
        batchSize: null
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--locales':
            case '-l':
                options.localesDir = path.resolve(args[++i]);
                break;
            case '--source':
            case '-s':
                options.sourceLang = args[++i];
                break;
            case '--target':
            case '-t':
                options.targetLang = args[++i];
                break;
            case '--dry-run':
            case '-d':
                options.dryRun = true;
                break;
            case '--no-backup':
                options.noBackup = true;
                break;
            case '--no-sort':
                options.noSort = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--batch-size':
            case '-b':
                options.batchSize = parseInt(args[++i], 10);
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
        }
    }

    return options;
}

function showHelp() {
    console.log(`
i18n Translation Sync Script

Usage:
  i18n-translate [options]

Options:
  --locales, -l <path>    Path to locales directory
  --source, -s <lang>     Source language code (default: en)
  --target, -t <lang>     Translate only this language
  --dry-run, -d           Show what would be translated without making changes
  --no-backup             Skip creating backup files
  --no-sort               Preserve key order instead of sorting alphabetically
  --verbose, -v           Show detailed output
  --batch-size, -b <n>    Number of keys to translate per API call (default: 20)
  --help, -h              Show this help message

Environment Variables:
  OPENAI_API_KEY          API key for the LLM provider (required)
  OPENAI_BASE_URL         API endpoint URL
  OPENAI_MODEL            Model to use (default: gpt-4o-mini)

Config Files (priority order):
  1. CLI arguments
  2. i18n.config.json in project root
  3. package.json "i18n" field
  4. Auto-detection + defaults

Example i18n.config.json:
  {
    "localesDir": "src/lib/i18n/locales",
    "sourceLang": "en",
    "batchSize": 20,
    "sortKeys": true,
    "api": {
      "url": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o-mini"
    }
  }

Local LLM Example (Ollama):
  OPENAI_BASE_URL=http://localhost:11434/v1/chat/completions \\
  OPENAI_MODEL=llama3.2 \\
  OPENAI_API_KEY=ollama \\
  i18n-translate
`);
}

// ============================================================================
// JSON Utilities
// ============================================================================

/**
 * Flattens a nested object into dot-notation keys
 * { a: { b: "c" } } => { "a.b": "c" }
 */
function flatten(obj, prefix = '') {
    const result = {};
    for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(result, flatten(obj[key], fullKey));
        } else {
            result[fullKey] = obj[key];
        }
    }
    return result;
}

/**
 * Unflattens dot-notation keys back into nested object
 * { "a.b": "c" } => { a: { b: "c" } }
 */
function unflatten(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in current)) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = obj[key];
    }
    return result;
}

/**
 * Sorts object keys alphabetically (recursive)
 */
function sortKeys(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
}

// ============================================================================
// API Communication
// ============================================================================

/**
 * Makes a request to the OpenAI-compatible API
 * Supports both HTTP and HTTPS for local LLM servers
 */
async function postToAI(messages, config) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        const url = new URL(config.api.url);

        // API key is required for OpenAI, optional for local servers (Ollama, etc.)
        const isOpenAI = url.hostname === 'api.openai.com';
        if (!apiKey && isOpenAI) {
            return reject(new Error('Missing OPENAI_API_KEY environment variable'));
        }

        const data = JSON.stringify({
            model: config.api.model,
            messages,
            temperature: 0.1
        });

        const client = url.protocol === 'https:' ? https : http;

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers
        };

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    return reject(new Error(`API Error ${res.statusCode}: ${body}`));
                }
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0] && json.choices[0].message) {
                        resolve(json.choices[0].message.content);
                    } else {
                        reject(new Error('Unexpected API response format'));
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON response from AI: ${e.message}`));
                }
            });
        });

        // Longer timeout for LLM requests (local Ollama or busy OpenAI endpoints)
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Request timeout (120s)'));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ============================================================================
// CLDR Plural Rules
// ============================================================================

/**
 * CLDR plural categories by language
 * Based on Unicode CLDR plural rules: https://cldr.unicode.org/index/cldr-spec/plural-rules
 *
 * Most languages use a subset of: zero, one, two, few, many, other
 * 'other' is always required and is the fallback
 */
const PLURAL_RULES = {
    // East Asian languages (no plural forms)
    zh: ['other'],
    ja: ['other'],
    ko: ['other'],
    vi: ['other'],
    th: ['other'],

    // Germanic languages (one/other)
    en: ['one', 'other'],
    de: ['one', 'other'],
    nl: ['one', 'other'],
    sv: ['one', 'other'],
    da: ['one', 'other'],
    no: ['one', 'other'],

    // Romance languages (one/other, some with many)
    es: ['one', 'many', 'other'],
    fr: ['one', 'many', 'other'],
    it: ['one', 'many', 'other'],
    pt: ['one', 'many', 'other'],
    ca: ['one', 'other'],
    ro: ['one', 'few', 'other'],

    // Slavic languages (complex plural forms)
    pl: ['one', 'few', 'many', 'other'],
    ru: ['one', 'few', 'many', 'other'],
    uk: ['one', 'few', 'many', 'other'],
    cs: ['one', 'few', 'many', 'other'],
    sk: ['one', 'few', 'many', 'other'],
    hr: ['one', 'few', 'other'],
    sr: ['one', 'few', 'other'],
    sl: ['one', 'two', 'few', 'other'],
    bs: ['one', 'few', 'other'],
    bg: ['one', 'other'],
    mk: ['one', 'other'],

    // Celtic languages
    ga: ['one', 'two', 'few', 'many', 'other'],  // Irish
    cy: ['zero', 'one', 'two', 'few', 'many', 'other'],  // Welsh
    gd: ['one', 'two', 'few', 'other'],  // Scottish Gaelic

    // Semitic languages
    ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
    he: ['one', 'two', 'many', 'other'],

    // Baltic languages
    lt: ['one', 'few', 'many', 'other'],
    lv: ['zero', 'one', 'other'],

    // Other European languages
    fi: ['one', 'other'],
    et: ['one', 'other'],
    hu: ['one', 'other'],
    el: ['one', 'other'],
    tr: ['one', 'other'],

    // Indic languages
    hi: ['one', 'other'],
    bn: ['one', 'other'],
    ta: ['one', 'other'],
    te: ['one', 'other'],
    mr: ['one', 'other'],
    gu: ['one', 'other'],
    kn: ['one', 'other'],
    ml: ['one', 'other'],
    pa: ['one', 'other'],

    // Other Asian languages
    id: ['other'],
    ms: ['other'],
    tl: ['one', 'other'],  // Filipino/Tagalog
};

/**
 * Gets the plural categories for a language code
 * Falls back to ['one', 'other'] if language not found
 */
function getPluralCategories(langCode) {
    // Handle regional variants (e.g., 'en-US' -> 'en')
    const baseLang = langCode.split('-')[0].toLowerCase();
    return PLURAL_RULES[baseLang] || ['one', 'other'];
}

// ============================================================================
// Translation Logic
// ============================================================================

/**
 * Extracts variables and components from translation strings
 * Returns array of patterns like {{name}}, <b>, </b>, etc.
 */
function extractPlaceholders(text) {
    const patterns = [];
    // Match {{variable}} patterns
    const varMatches = text.match(/\{\{[^}]+\}\}/g);
    if (varMatches) patterns.push(...varMatches);
    // Match component tags (PascalCase) and common HTML rich-text tags
    // This avoids matching mathematical comparisons like "x < y"
    // Matches: <Component>, </Component>, <b>, <i>, <em>, <strong>, <span>, <a>, etc.
    const tagMatches = text.match(/<(?:\/?\s*[A-Z][A-Za-z0-9]*|\/?\s*(?:b|i|u|s|em|strong|span|a|br|hr|p|div|code|pre|mark|sub|sup))\s*[^>]*>/gi);
    if (tagMatches) patterns.push(...tagMatches);
    return patterns;
}

/**
 * Validates that translated text preserves all placeholders
 */
function validatePlaceholders(original, translated) {
    const originalPlaceholders = extractPlaceholders(original);
    const translatedPlaceholders = extractPlaceholders(translated);

    for (const placeholder of originalPlaceholders) {
        if (!translatedPlaceholders.includes(placeholder)) {
            return false;
        }
    }
    return true;
}

/**
 * Translates a batch of key-value pairs
 */
async function translateBatch(entries, sourceLang, targetLang, config, verbose) {
    // Get plural categories for both languages
    const sourcePlurals = getPluralCategories(sourceLang);
    const targetPlurals = getPluralCategories(targetLang);

    // Build plural rules instruction if target language has different plural forms
    let pluralInstruction = '';
    if (JSON.stringify(sourcePlurals) !== JSON.stringify(targetPlurals)) {
        pluralInstruction = `
6. PLURAL FORMS: The target language (${targetLang}) requires these plural categories: ${targetPlurals.join(', ')}
   - If a key ends with "_one", "_other", "_few", "_many", "_two", or "_zero", it's a plural form
   - For each plural key you translate, you may need to CREATE additional keys for the target language
   - Example: If source has "items_one" and "items_other", but target needs "few" and "many":
     - Keep "items_one" and "items_other" translated
     - ADD "items_few" and "items_many" with appropriate translations
   - The plural categories for ${targetLang} are: ${targetPlurals.map(p => `"${p}"`).join(', ')}`;
    }

    const prompt = `You are a professional translator. Translate the following JSON key-value pairs from ${sourceLang} to ${targetLang}.

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Preserve ALL placeholders exactly: {{variable}}, <tag>, </tag>
3. Keep the same JSON keys, only translate the values
4. Maintain the same tone and style as the original
5. For plural forms, translate appropriately for the target language${pluralInstruction}

Input JSON:
${JSON.stringify(Object.fromEntries(entries), null, 2)}

Return the translated JSON:`;

    const messages = [
        { role: 'system', content: 'You are a translation assistant. Output only valid JSON.' },
        { role: 'user', content: prompt }
    ];

    if (verbose) {
        console.log(`  Translating batch of ${entries.length} keys...`);
    }

    const response = await postToAI(messages, config);

    // Clean up response - remove markdown code blocks if present
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
    }
    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
    }
    cleanResponse = cleanResponse.trim();

    try {
        const translated = JSON.parse(cleanResponse);

        // Validate placeholders
        const validated = {};

        // First, validate all original keys
        for (const [key, originalValue] of entries) {
            if (key in translated) {
                const translatedValue = translated[key];
                if (validatePlaceholders(originalValue, translatedValue)) {
                    validated[key] = translatedValue;
                } else {
                    console.warn(`  Warning: Placeholder mismatch for "${key}", keeping original`);
                    validated[key] = originalValue;
                }
            } else {
                console.warn(`  Warning: Missing translation for "${key}", keeping original`);
                validated[key] = originalValue;
            }
        }

        // Accept new plural keys added by the LLM (e.g., _few, _many for Polish)
        // Only accept if the source has a confirmed plural group (multiple plural variants of same base)
        const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other'];
        const sourceKeys = new Set(entries.map(([k]) => k));

        // Build a map of confirmed plural base keys from source
        // A base key is "confirmed" if it has at least one plural suffix in source
        const confirmedPluralBases = new Set();
        for (const [k] of entries) {
            for (const suffix of pluralSuffixes) {
                if (k.endsWith(suffix)) {
                    // Extract base by removing the suffix (exact match, not regex)
                    const base = k.slice(0, -suffix.length);
                    confirmedPluralBases.add(base);
                    break;
                }
            }
        }

        for (const [key, value] of Object.entries(translated)) {
            if (!sourceKeys.has(key)) {
                // Check if this is a valid new plural key
                let matchedSuffix = null;
                for (const suffix of pluralSuffixes) {
                    if (key.endsWith(suffix)) {
                        matchedSuffix = suffix;
                        break;
                    }
                }

                if (matchedSuffix) {
                    // Extract base key using exact suffix match (not regex)
                    // This prevents "zone_one_status" from being misidentified
                    const baseKey = key.slice(0, -matchedSuffix.length);

                    // Only accept if this base key has confirmed plural variants in source
                    if (confirmedPluralBases.has(baseKey) && typeof value === 'string') {
                        validated[key] = value;
                        if (verbose) {
                            console.log(`    Added plural form: ${key}`);
                        }
                    }
                }
            }
        }

        return validated;
    } catch (e) {
        throw new Error(`Failed to parse translation response: ${e.message}\nResponse was: ${cleanResponse}`);
    }
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Creates a backup of a file
 */
function createBackup(filePath) {
    const backupPath = filePath + '.bak';
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
}

/**
 * Reads and parses a JSON locale file
 */
function readLocaleFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
}

/**
 * Writes a locale file with consistent formatting
 */
function writeLocaleFile(filePath, data) {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
}

// ============================================================================
// Main Sync Logic
// ============================================================================

async function syncTranslations(config, cliOptions) {
    const { localesDir, sourceLang, batchSize } = config;
    const { targetLang, dryRun, noBackup, noSort, verbose } = cliOptions;

    // Determine if we should sort keys (CLI --no-sort overrides config)
    const shouldSortKeys = noSort ? false : config.sortKeys;

    if (!localesDir) {
        console.error('Error: Could not find locales directory.');
        console.error('Please specify with --locales or create i18n.config.json');
        process.exit(1);
    }

    if (!fs.existsSync(localesDir)) {
        console.error(`Error: Locales directory does not exist: ${localesDir}`);
        process.exit(1);
    }

    console.log(`\nLocales directory: ${localesDir}`);
    console.log(`Source language: ${sourceLang}`);
    if (dryRun) console.log('DRY RUN - no files will be modified\n');

    // Read source file
    const sourceFile = path.join(localesDir, `${sourceLang}.json`);
    if (!fs.existsSync(sourceFile)) {
        console.error(`Error: Source file not found: ${sourceFile}`);
        process.exit(1);
    }

    const sourceData = readLocaleFile(sourceFile);
    const sourceFlat = flatten(sourceData);
    const sourceKeys = new Set(Object.keys(sourceFlat));

    console.log(`Source file: ${sourceLang}.json (${sourceKeys.size} keys)\n`);

    // Get target files
    const localeFiles = fs.readdirSync(localesDir)
        .filter(f => f.endsWith('.json') && f !== `${sourceLang}.json`);

    if (targetLang) {
        const targetFile = `${targetLang}.json`;
        if (!localeFiles.includes(targetFile)) {
            console.error(`Error: Target file not found: ${targetFile}`);
            process.exit(1);
        }
        localeFiles.length = 0;
        localeFiles.push(targetFile);
    }

    if (localeFiles.length === 0) {
        console.log('No target locale files found to translate.');
        return;
    }

    // Process each target file
    for (const file of localeFiles) {
        const lang = file.replace('.json', '');
        const filePath = path.join(localesDir, file);

        console.log(`\nProcessing: ${file}`);

        // Read target file
        let targetData = {};
        if (fs.existsSync(filePath)) {
            targetData = readLocaleFile(filePath);
        }
        const targetFlat = flatten(targetData);

        // Find keys to translate (missing in target)
        const missingKeys = [];
        for (const key of sourceKeys) {
            if (!(key in targetFlat)) {
                missingKeys.push([key, sourceFlat[key]]);
            }
        }

        // Find obsolete keys (in target but not in source)
        const obsoleteKeys = [];
        for (const key of Object.keys(targetFlat)) {
            if (!sourceKeys.has(key)) {
                obsoleteKeys.push(key);
            }
        }

        console.log(`  Missing keys: ${missingKeys.length}`);
        console.log(`  Obsolete keys: ${obsoleteKeys.length}`);

        if (missingKeys.length === 0 && obsoleteKeys.length === 0) {
            console.log('  Already in sync!');
            continue;
        }

        if (dryRun) {
            if (missingKeys.length > 0) {
                console.log('  Would translate:');
                for (const [key] of missingKeys.slice(0, 5)) {
                    console.log(`    - ${key}`);
                }
                if (missingKeys.length > 5) {
                    console.log(`    ... and ${missingKeys.length - 5} more`);
                }
            }
            if (obsoleteKeys.length > 0) {
                console.log('  Would remove:');
                for (const key of obsoleteKeys.slice(0, 5)) {
                    console.log(`    - ${key}`);
                }
                if (obsoleteKeys.length > 5) {
                    console.log(`    ... and ${obsoleteKeys.length - 5} more`);
                }
            }
            continue;
        }

        // Create backup
        if (!noBackup && fs.existsSync(filePath)) {
            const backupPath = createBackup(filePath);
            console.log(`  Backup created: ${path.basename(backupPath)}`);
        }

        // Remove obsolete keys
        for (const key of obsoleteKeys) {
            delete targetFlat[key];
            if (verbose) {
                console.log(`  Removed: ${key}`);
            }
        }

        // Translate missing keys in batches
        if (missingKeys.length > 0) {
            console.log(`  Translating ${missingKeys.length} keys...`);

            for (let i = 0; i < missingKeys.length; i += batchSize) {
                const batch = missingKeys.slice(i, i + batchSize);
                try {
                    const translated = await translateBatch(batch, sourceLang, lang, config, verbose);
                    Object.assign(targetFlat, translated);

                    if (verbose) {
                        for (const [key, value] of Object.entries(translated)) {
                            console.log(`    ${key}: ${value}`);
                        }
                    }
                } catch (e) {
                    console.error(`  Error translating batch: ${e.message}`);
                    // Continue with next batch
                }
            }
        }

        // Unflatten and optionally sort keys
        let newData = unflatten(targetFlat);
        if (shouldSortKeys) {
            newData = sortKeys(newData);
        }

        // Write updated file
        writeLocaleFile(filePath, newData);
        console.log(`  Updated: ${file}`);
    }

    console.log('\nTranslation sync complete!');
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
    console.log('i18n Translation Sync\n');

    const cliOptions = parseArgs();
    const config = loadConfig(cliOptions);

    if (cliOptions.verbose) {
        console.log('Configuration:', JSON.stringify(config, null, 2));
    }

    try {
        await syncTranslations(config, cliOptions);
    } catch (e) {
        console.error(`\nFatal error: ${e.message}`);
        process.exit(1);
    }
}

main();
