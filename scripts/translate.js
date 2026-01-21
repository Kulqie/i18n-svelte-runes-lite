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
                        // Strip inline comments (everything after # that's not in quotes)
                        const hashIndex = value.indexOf('#');
                        if (hashIndex > 0 && !value.slice(0, hashIndex).includes('"') && !value.slice(0, hashIndex).includes("'")) {
                            value = value.slice(0, hashIndex).trim();
                        }
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
    sortKeys: false,  // Set to true to sort keys alphabetically
    api: {
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini'
    }
};

/**
 * Detects the locales directory by searching common paths
 * Supports both bundled (en.json) and namespaced (en/common.json) structures
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
                const entries = fs.readdirSync(fullPath, { withFileTypes: true });

                // Check for bundled structure: en.json, pl.json (exclude hidden files like .DS_Store)
                const jsonFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'));
                if (jsonFiles.length > 0) {
                    return fullPath;
                }

                // Check for namespaced structure: en/, pl/ directories with JSON inside
                const localeDirs = entries.filter(e => e.isDirectory() && /^[a-z]{2}(-[A-Z]{2})?$/.test(e.name));
                for (const localeDir of localeDirs) {
                    const localePath = path.join(fullPath, localeDir.name);
                    const localeFiles = fs.readdirSync(localePath).filter(f => f.endsWith('.json') && !f.startsWith('.'));
                    if (localeFiles.length > 0) {
                        return fullPath;
                    }
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
        let baseUrl = process.env.OPENAI_BASE_URL.trim();
        // Normalize: if user provides base URL without /chat/completions, add it
        // Common patterns: /v1, /v1/, /api/v1, /api/v1/
        if (!baseUrl.includes('/chat/completions')) {
            baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
            baseUrl += '/chat/completions';
        }
        config.api.url = baseUrl;
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
        sort: false,
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
            case '--sort':
                options.sort = true;
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
  --sort                  Sort keys alphabetically
  --no-sort               Preserve key order (default)
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
    "sortKeys": false,
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
 * Delay helper for rate limiting and backoff
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Makes a single request to the OpenAI-compatible API
 * @param {Array} messages - Chat messages
 * @param {Object} config - Configuration object
 * @param {boolean} useJsonFormat - Whether to request JSON response format
 */
async function postToAISingle(messages, config, useJsonFormat = true) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        const url = new URL(config.api.url);

        // API key is required for OpenAI, optional for local servers (Ollama, etc.)
        const isOpenAI = url.hostname === 'api.openai.com';
        if (!apiKey && isOpenAI) {
            return reject(new Error('Missing OPENAI_API_KEY environment variable'));
        }

        const payload = {
            model: config.api.model,
            messages,
            temperature: 0.1
        };

        // Add response_format only if requested (some local LLMs don't support it)
        if (useJsonFormat) {
            payload.response_format = { type: "json_object" };
        }

        const data = JSON.stringify(payload);
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
            headers,
            // Force IPv4 for localhost to avoid ECONNREFUSED ::1 issues with local LLM servers
            family: (url.hostname === 'localhost' || url.hostname === '127.0.0.1') ? 4 : undefined
        };

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    const truncatedBody = body.length > 200 ? body.slice(0, 200) + '...' : body;
                    const error = new Error(`API Error ${res.statusCode}: ${truncatedBody}`);
                    error.statusCode = res.statusCode;
                    return reject(error);
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

        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Request timeout (120s)'));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Makes a request to the API with retry logic and fallback
 * - Retries up to 3 times with exponential backoff
 * - Falls back to non-JSON format if response_format causes errors
 */
async function postToAI(messages, config) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    let lastError;
    let useJsonFormat = true;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await postToAISingle(messages, config, useJsonFormat);
        } catch (error) {
            lastError = error;

            // If response_format is not supported (400 error mentioning it), disable and retry immediately
            if (error.statusCode === 400 && error.message.includes('response_format')) {
                console.warn('    Warning: response_format not supported, retrying without it...');
                useJsonFormat = false;
                continue;
            }

            // Don't retry on auth errors
            if (error.statusCode === 401 || error.statusCode === 403) {
                throw error;
            }

            // Rate limit - wait longer
            if (error.statusCode === 429) {
                const waitTime = baseDelay * Math.pow(2, attempt) * 2; // Double the backoff for rate limits
                console.warn(`    Rate limited, waiting ${waitTime / 1000}s before retry ${attempt}/${maxRetries}...`);
                await delay(waitTime);
                continue;
            }

            // Other errors - exponential backoff
            if (attempt < maxRetries) {
                const waitTime = baseDelay * Math.pow(2, attempt - 1);
                console.warn(`    Request failed, retrying in ${waitTime / 1000}s (${attempt}/${maxRetries})...`);
                await delay(waitTime);
            }
        }
    }

    throw lastError;
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
 * Sanitizes JSON response from LLM
 * Removes markdown code blocks, JS comments, and fixes trailing commas
 */
function sanitizeJson(str) {
    // 1. Remove markdown code blocks
    str = str.trim();
    if (str.startsWith('```json')) {
        str = str.slice(7);
    } else if (str.startsWith('```')) {
        str = str.slice(3);
    }
    if (str.endsWith('```')) {
        str = str.slice(0, -3);
    }
    str = str.trim();

    // 2. Remove single-line JS comments (// ...) outside of strings
    // Process line by line to safely handle strings
    const lines = str.split('\n');
    const cleanedLines = lines.map(line => {
        let inString = false;
        let stringChar = null;
        let result = '';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const prevChar = i > 0 ? line[i - 1] : '';

            // Track string state
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
            }

            // Check for // comment outside string
            if (!inString && char === '/' && line[i + 1] === '/') {
                break; // Stop here, rest is comment
            }

            result += char;
        }

        return result;
    });
    str = cleanedLines.join('\n');

    // 3. Remove multi-line JS comments (/* ... */)
    str = str.replace(/\/\*[\s\S]*?\*\//g, '');

    // 4. Fix trailing commas before } or ]
    str = str.replace(/,(\s*[}\]])/g, '$1');

    return str.trim();
}

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

    // Sanitize response - remove markdown, JS comments, fix trailing commas
    const cleanResponse = sanitizeJson(response);

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
    const { targetLang, dryRun, noBackup, noSort, sort, verbose } = cliOptions;

    // Determine if we should sort keys (CLI flags override config)
    const shouldSortKeys = sort ? true : (noSort ? false : config.sortKeys);

    if (!localesDir) {
        console.error('Error: Could not find locales directory.');
        console.error('Please specify with --locales or create i18n.config.json');
        process.exit(1);
    }

    if (!fs.existsSync(localesDir)) {
        console.error(`Error: Locales directory does not exist: ${localesDir}`);
        process.exit(1);
    }

    // 1. Detect structure: Namespaced (en/common.json) vs Bundled (en.json)
    const sourceLangPath = path.join(localesDir, sourceLang);
    const isNamespaced = fs.existsSync(sourceLangPath) && fs.lstatSync(sourceLangPath).isDirectory();

    console.log(`\nLocales directory: ${localesDir}`);
    console.log(`Structure: ${isNamespaced ? 'Namespaced' : 'Bundled'}`);
    console.log(`Source language: ${sourceLang}`);
    if (dryRun) console.log('DRY RUN - no files will be modified\n');

    // 2. Build translation tasks
    const translationTasks = [];

    if (isNamespaced) {
        // Namespaced mode: en/common.json, en/errors.json, etc.
        const sourceDirPath = path.join(localesDir, sourceLang);

        if (!fs.existsSync(sourceDirPath)) {
            console.error(`Error: Source directory not found: ${sourceDirPath}`);
            process.exit(1);
        }

        const namespaces = fs.readdirSync(sourceDirPath).filter(f => f.endsWith('.json') && !f.startsWith('.'));

        if (namespaces.length === 0) {
            console.error(`Error: No JSON files found in ${sourceDirPath}`);
            process.exit(1);
        }

        // Get target language directories
        let langDirs = fs.readdirSync(localesDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name !== sourceLang && /^[a-z]{2}(-[A-Z]{2})?$/.test(e.name))
            .map(e => e.name);

        // If --target is specified but directory doesn't exist, create it
        if (targetLang && !langDirs.includes(targetLang)) {
            if (/^[a-z]{2}(-[A-Z]{2})?$/.test(targetLang)) {
                const newLangDir = path.join(localesDir, targetLang);
                if (!dryRun) {
                    fs.mkdirSync(newLangDir, { recursive: true });
                    console.log(`Created new language directory: ${targetLang}/`);
                } else {
                    console.log(`Would create new language directory: ${targetLang}/`);
                }
                langDirs.push(targetLang);
            } else {
                console.error(`Error: Invalid language code format: ${targetLang}`);
                console.error('Expected format: xx or xx-XX (e.g., en, pl, pt-BR)');
                process.exit(1);
            }
        }

        // If no target languages found and none specified, show helpful message
        if (langDirs.length === 0 && !targetLang) {
            console.log('\nNo target language directories found.');
            console.log('To add a new language, use: i18n-translate --target <lang>');
            console.log('Example: i18n-translate --target pl');
            return;
        }

        for (const ns of namespaces) {
            const task = {
                name: ns,
                sourceFilePath: path.join(sourceDirPath, ns),
                targets: {}
            };

            for (const lang of targetLang ? [targetLang] : langDirs) {
                task.targets[lang] = path.join(localesDir, lang, ns);

                // Ensure target directory exists (for non-dry-run)
                if (!dryRun) {
                    const targetDirPath = path.join(localesDir, lang);
                    if (!fs.existsSync(targetDirPath)) {
                        fs.mkdirSync(targetDirPath, { recursive: true });
                    }
                }
            }

            translationTasks.push(task);
        }
    } else {
        // Bundled mode: en.json, pl.json
        const sourceFile = path.join(localesDir, `${sourceLang}.json`);

        if (!fs.existsSync(sourceFile)) {
            console.error(`Error: Source file not found: ${sourceFile}`);
            process.exit(1);
        }

        const task = {
            name: `${sourceLang}.json`,
            sourceFilePath: sourceFile,
            targets: {}
        };

        let localeFiles = fs.readdirSync(localesDir)
            .filter(f => f.endsWith('.json') && !f.startsWith('.') && f !== `${sourceLang}.json`)
            .map(f => f.replace('.json', ''));

        // If --target is specified but file doesn't exist, we'll create it
        if (targetLang) {
            if (!localeFiles.includes(targetLang)) {
                if (/^[a-z]{2}(-[A-Z]{2})?$/.test(targetLang)) {
                    console.log(`Will create new locale file: ${targetLang}.json`);
                    localeFiles.push(targetLang);
                } else {
                    console.error(`Error: Invalid language code format: ${targetLang}`);
                    console.error('Expected format: xx or xx-XX (e.g., en, pl, pt-BR)');
                    process.exit(1);
                }
            }
            // Only process the specified target
            localeFiles = [targetLang];
        }

        // If no target languages found and none specified, show helpful message
        if (localeFiles.length === 0 && !targetLang) {
            console.log('\nNo target locale files found.');
            console.log('To add a new language, use: i18n-translate --target <lang>');
            console.log('Example: i18n-translate --target pl');
            return;
        }

        for (const lang of localeFiles) {
            task.targets[lang] = path.join(localesDir, `${lang}.json`);
        }

        translationTasks.push(task);
    }

    if (translationTasks.length === 0) {
        console.log('No translation tasks found.');
        return;
    }

    // 3. Process each task
    for (const task of translationTasks) {
        console.log(`\n--- Processing: ${task.name} ---`);

        const sourceData = readLocaleFile(task.sourceFilePath);
        const sourceFlat = flatten(sourceData);
        const sourceKeys = new Set(Object.keys(sourceFlat));

        console.log(`  Source: ${sourceKeys.size} keys`);

        for (const [lang, targetFilePath] of Object.entries(task.targets)) {
            console.log(`\n  Target [${lang}]: ${path.relative(process.cwd(), targetFilePath)}`);

            // Read target file
            let targetFlat = {};
            if (fs.existsSync(targetFilePath)) {
                targetFlat = flatten(readLocaleFile(targetFilePath));
            }

            // Find missing and obsolete keys
            const missingKeys = [];
            for (const key of sourceKeys) {
                if (!(key in targetFlat)) {
                    missingKeys.push([key, sourceFlat[key]]);
                }
            }

            const obsoleteKeys = Object.keys(targetFlat).filter(k => !sourceKeys.has(k));

            console.log(`    Missing: ${missingKeys.length}, Obsolete: ${obsoleteKeys.length}`);

            if (missingKeys.length === 0 && obsoleteKeys.length === 0) {
                console.log('    In sync.');
                continue;
            }

            if (dryRun) {
                if (missingKeys.length > 0) {
                    console.log('    Would translate:');
                    for (const [key] of missingKeys.slice(0, 5)) {
                        console.log(`      - ${key}`);
                    }
                    if (missingKeys.length > 5) {
                        console.log(`      ... and ${missingKeys.length - 5} more`);
                    }
                }
                if (obsoleteKeys.length > 0) {
                    console.log('    Would remove:');
                    for (const key of obsoleteKeys.slice(0, 5)) {
                        console.log(`      - ${key}`);
                    }
                    if (obsoleteKeys.length > 5) {
                        console.log(`      ... and ${obsoleteKeys.length - 5} more`);
                    }
                }
                continue;
            }

            // Create backup
            if (!noBackup && fs.existsSync(targetFilePath)) {
                const backupPath = createBackup(targetFilePath);
                console.log(`    Backup created: ${path.basename(backupPath)}`);
            }

            // Remove obsolete keys
            for (const key of obsoleteKeys) {
                delete targetFlat[key];
                if (verbose) {
                    console.log(`    Removed: ${key}`);
                }
            }

            // Translate missing keys in batches
            if (missingKeys.length > 0) {
                const totalBatches = Math.ceil(missingKeys.length / batchSize);
                console.log(`    Translating ${missingKeys.length} keys in ${totalBatches} batch(es)...`);

                for (let i = 0; i < missingKeys.length; i += batchSize) {
                    const batchNum = Math.floor(i / batchSize) + 1;
                    const batch = missingKeys.slice(i, i + batchSize);

                    if (verbose) {
                        console.log(`    Batch ${batchNum}/${totalBatches} (${batch.length} keys)...`);
                    }

                    try {
                        const translated = await translateBatch(batch, sourceLang, lang, config, verbose);
                        Object.assign(targetFlat, translated);

                        if (verbose) {
                            for (const [key, value] of Object.entries(translated)) {
                                console.log(`      ${key}: ${value}`);
                            }
                        }
                    } catch (e) {
                        console.error(`    Error translating batch ${batchNum}: ${e.message}`);
                        // Keys from this batch won't be translated, but we continue with remaining batches
                    }

                    // Rate limiting: add delay between batches (except after the last one)
                    if (i + batchSize < missingKeys.length) {
                        await delay(250); // 250ms delay between batches
                    }
                }
            }

            // Unflatten and sort keys
            let newData = unflatten(targetFlat);
            if (shouldSortKeys) {
                newData = sortKeys(newData);
            }

            writeLocaleFile(targetFilePath, newData);
            console.log(`    Updated successfully.`);
        }
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
