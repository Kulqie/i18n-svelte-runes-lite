/**
 * Parser for component slots in translation strings
 *
 * Transforms strings like "Hello <Link>world</Link>, click <Button>here</Button>"
 * into an array of text and slot nodes that can be rendered with Svelte slots.
 */

/**
 * Maximum allowed length for translation strings to prevent ReDoS attacks.
 *
 * SECURITY NOTE (ReDoS Mitigation):
 * The tag regex uses a ReDoS-safe pattern with negated character classes
 * instead of lazy match-all. This limit provides defense-in-depth by capping
 * input size to 10KB.
 *
 * Why 10KB is safe:
 * - Translation strings are typically < 1KB (a few sentences)
 * - 10KB allows for unusually long translations while preventing abuse
 * - The regex pattern prevents crossing tag boundaries, eliminating backtracking
 *
 * If you encounter legitimate translations > 10KB, consider splitting them
 * into multiple keys or increasing this limit with caution.
 */
const MAX_TEMPLATE_LENGTH = 10000;

/**
 * Simple LRU-style cache for parsed templates to avoid re-parsing identical strings.
 * Most i18n usage repeatedly renders the same translation keys, so caching is effective.
 */
const parseCache = new Map<string, SlotNode[]>();
const MAX_CACHE_SIZE = 100;

export interface SlotNode {
    type: 'text' | 'slot';
    /** Text content for 'text' nodes */
    content?: string;
    /** Slot name (lowercased) for 'slot' nodes */
    name?: string;
    /** Inner content of the slot (text between opening and closing tags) */
    slotContent?: string;
    /** Attributes parsed from the tag (e.g., { href: '/login', class: 'link' }) */
    attributes?: Record<string, string>;
}

/**
 * Check if an attribute name is a dangerous event handler (onclick, onmouseover, etc.)
 * @param name - Attribute name to check
 * @returns true if the attribute is a potential XSS vector
 */
function isDangerousAttribute(name: string): boolean {
    // Block all on* event handlers (case-insensitive)
    return /^on[a-z]+$/i.test(name);
}

/**
 * SAFE URL PROTOCOLS - Whitelist Approach
 *
 * SECURITY: Using a whitelist is more secure than a blacklist because:
 * - Blacklists can be bypassed with control characters (e.g., "java\x00script:")
 * - Blacklists can be bypassed with URL encoding tricks
 * - Blacklists require knowing all dangerous protocols upfront
 * - Whitelists only allow explicitly safe protocols, blocking unknown vectors
 *
 * Allowed protocols:
 * - http: / https: - Standard web URLs
 * - mailto: - Email links
 * - tel: - Phone number links
 * - (relative URLs) - Paths starting with /, #, or alphanumeric
 */
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Check if a URL value is safe to use (whitelist approach)
 * @param value - Attribute value to check
 * @returns true if the URL is safe (matches whitelist or is relative)
 *
 * SECURITY: This uses a whitelist approach which is more robust than blacklisting.
 * Only explicitly allowed protocols pass. Unknown protocols are blocked by default.
 * Uses native URL constructor for robust protocol parsing, avoiding regex edge cases.
 */
function isSafeUrl(value: string): boolean {
    // Remove control characters and normalize whitespace
    // Control chars like \x00 can be used to bypass naive blacklists
    const cleaned = value.replace(/[\x00-\x1f\x7f]/g, '').trim();

    if (!cleaned) return true; // Empty is safe (will be a no-op)

    // Relative URLs: start with /, #, or .
    if (/^[/#.]/.test(cleaned)) return true;

    // No colon = relative path (e.g., "page/subpage")
    if (!cleaned.includes(':')) return true;

    // Use URL constructor for robust protocol parsing
    try {
        // Use dummy base for relative URL parsing
        const url = new URL(cleaned, 'http://dummy.invalid');
        return SAFE_URL_PROTOCOLS.has(url.protocol);
    } catch {
        // Invalid URL - block it
        return false;
    }
}

/**
 * Parse an HTML-like attribute string into a Record
 *
 * SECURITY: This function sanitizes attributes to prevent XSS attacks:
 * - Removes all on* event handlers (onclick, onmouseover, etc.)
 * - Validates href/src/action attributes using WHITELIST approach:
 *   Only http(s):, mailto:, tel:, and relative URLs are allowed.
 *   Unknown protocols (javascript:, data:, vbscript:, etc.) are blocked.
 *
 * @example parseAttributes(" href='/home' class=\"nav\"") => { href: '/home', class: 'nav' }
 * @example parseAttributes(" onclick=\"alert(1)\"") => undefined (dangerous attr removed)
 * @example parseAttributes(" href=\"javascript:alert(1)\"") => undefined (unsafe protocol)
 */
function parseAttributes(attrString: string | undefined): Record<string, string> | undefined {
    if (!attrString || !attrString.trim()) {
        return undefined;
    }

    const attributes: Record<string, string> = {};
    // Match: name="value", name='value', name=value (unquoted), or boolean attributes (name only)
    // Supports: href="/path", class='btn', disabled=true, disabled (boolean)
    // Group 1: attribute name
    // Group 2: double-quoted value (optional)
    // Group 3: single-quoted value (optional)
    // Group 4: unquoted value (optional)
    // If groups 2-4 are all undefined, it's a boolean attribute
    //
    // SECURITY: Per HTML5 spec, unquoted attribute values cannot contain: " ' = < > ` or whitespace
    // Using [^\s"'=<>`]+ instead of \S+ prevents over-matching and reduces backtracking (ReDoS mitigation)
    const attrRegex = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attrString)) !== null) {
        const name = match[1];

        // SECURITY: Skip dangerous event handler attributes
        if (isDangerousAttribute(name)) {
            console.warn(`[i18n-svelte-runes-lite] Blocked dangerous attribute "${name}" in translation string.`);
            continue;
        }

        // Value is in group 2 (double quotes), 3 (single quotes), 4 (unquoted), or empty string for boolean
        const value = match[2] ?? match[3] ?? match[4] ?? '';

        // SECURITY: Validate URLs in href, src, action, formaction, etc. using whitelist
        const urlAttributes = ['href', 'src', 'action', 'formaction', 'xlink:href', 'poster'];
        if (urlAttributes.includes(name.toLowerCase()) && !isSafeUrl(value)) {
            console.warn(`[i18n-svelte-runes-lite] Blocked unsafe URL in "${name}" attribute: only http(s), mailto, tel, and relative URLs are allowed.`);
            continue;
        }

        attributes[name] = value;
    }

    return Object.keys(attributes).length > 0 ? attributes : undefined;
}

/**
 * Parse a translation string into text and slot nodes
 *
 * @example
 * parseComponentSlots("Accept <Link>terms</Link> and <Button>privacy</Button>")
 * // Returns:
 * // [
 * //   { type: 'text', content: 'Accept ' },
 * //   { type: 'slot', name: 'link', slotContent: 'terms' },
 * //   { type: 'text', content: ' and ' },
 * //   { type: 'slot', name: 'button', slotContent: 'privacy' }
 * // ]
 *
 * @example Tags with attributes (attributes are parsed and available to snippets)
 * parseComponentSlots("Click <Link href='/home' class='nav'>here</Link>")
 * // Returns:
 * // [
 * //   { type: 'text', content: 'Click ' },
 * //   { type: 'slot', name: 'link', slotContent: 'here', attributes: { href: '/home', class: 'nav' } }
 * // ]
 *
 * @example Kebab-case component names
 * parseComponentSlots("Press <my-button>submit</my-button>")
 * // Returns:
 * // [
 * //   { type: 'text', content: 'Press ' },
 * //   { type: 'slot', name: 'my-button', slotContent: 'submit' }
 * // ]
 *
 * @limitation Does not support nesting of the same tag names.
 * `<Link>outer <Link>inner</Link></Link>` → incorrect parsing.
 * Use different tag names instead: `<LinkOuter><LinkInner>...</LinkInner></LinkOuter>`
 *
 * @param template - Translation string with component placeholders
 * @returns Array of SlotNode objects
 */
export function parseComponentSlots(template: string): SlotNode[] {
    // Check cache first
    const cached = parseCache.get(template);
    if (cached) return cached;

    // Length limit for defense-in-depth
    if (template.length > MAX_TEMPLATE_LENGTH) {
        console.warn(`[i18n-svelte-runes-lite] Translation string exceeds ${MAX_TEMPLATE_LENGTH} chars, skipping component slot parsing.`);
        return [{ type: 'text', content: template }];
    }

    const nodes: SlotNode[] = [];
    let pos = 0;
    let textStart = 0;

    while (pos < template.length) {
        // Find next '<'
        const tagStart = template.indexOf('<', pos);

        if (tagStart === -1) {
            // No more tags - rest is text
            break;
        }

        // Check if this looks like an opening tag (not closing, not comment)
        if (template[tagStart + 1] === '/' || template[tagStart + 1] === '!') {
            pos = tagStart + 1;
            continue;
        }

        // Extract tag name (letters, numbers, hyphens, starting with letter)
        let nameEnd = tagStart + 1;
        if (!/[A-Za-z]/.test(template[nameEnd] || '')) {
            pos = tagStart + 1;
            continue;
        }
        while (nameEnd < template.length && /[A-Za-z0-9-]/.test(template[nameEnd])) {
            nameEnd++;
        }
        const tagName = template.slice(tagStart + 1, nameEnd);

        if (!tagName) {
            pos = tagStart + 1;
            continue;
        }

        // Find end of opening tag '>'
        const tagEnd = template.indexOf('>', nameEnd);
        if (tagEnd === -1) {
            pos = tagStart + 1;
            continue;
        }

        // Extract attributes (between tag name and >)
        const attrString = template.slice(nameEnd, tagEnd).trim() || undefined;

        // Find closing tag </tagName>
        const closingTag = `</${tagName}>`;

        // Search for closing tag (case-insensitive for tag name)
        let closePos = tagEnd + 1;
        let foundClose = -1;
        while (closePos < template.length) {
            const nextClose = template.indexOf('</', closePos);
            if (nextClose === -1) break;

            const closeEnd = template.indexOf('>', nextClose);
            if (closeEnd === -1) break;

            const closeName = template.slice(nextClose + 2, closeEnd);
            if (closeName.toLowerCase() === tagName.toLowerCase()) {
                foundClose = nextClose;
                break;
            }
            closePos = closeEnd + 1;
        }

        if (foundClose === -1) {
            // No closing tag found - skip this tag
            pos = tagStart + 1;
            continue;
        }

        // We found a complete tag pair
        // Add text before this tag
        if (tagStart > textStart) {
            const textContent = template.slice(textStart, tagStart);
            if (textContent) {
                nodes.push({ type: 'text', content: textContent });
            }
        }

        // Extract inner content
        const innerContent = template.slice(tagEnd + 1, foundClose);
        const parsedAttrs = parseAttributes(attrString);

        const slotNode: SlotNode = {
            type: 'slot',
            name: tagName.toLowerCase(),
            slotContent: innerContent
        };

        if (parsedAttrs) {
            slotNode.attributes = parsedAttrs;
        }

        nodes.push(slotNode);

        // Move past closing tag
        const closeTagEnd = foundClose + closingTag.length;
        textStart = closeTagEnd;
        pos = closeTagEnd;
    }

    // Add remaining text
    if (textStart < template.length) {
        const remainingText = template.slice(textStart);
        if (remainingText) {
            nodes.push({ type: 'text', content: remainingText });
        }
    }

    // If no nodes, return entire string as text
    if (nodes.length === 0 && template) {
        nodes.push({ type: 'text', content: template });
    }

    // Cache result (LRU eviction)
    if (parseCache.size >= MAX_CACHE_SIZE) {
        const firstKey = parseCache.keys().next().value;
        if (firstKey !== undefined) parseCache.delete(firstKey);
    }
    parseCache.set(template, nodes);

    return nodes;
}

/**
 * Check if a translation string contains component slots
 * Useful for determining whether to use Trans or TransRich
 *
 * @param template - Translation string to check
 * @returns true if the string contains component slots
 */
export function hasComponentSlots(template: string): boolean {
    if (template.length > MAX_TEMPLATE_LENGTH) {
        return false;
    }

    // Linear scan for any complete tag pair
    let pos = 0;
    while (pos < template.length) {
        const tagStart = template.indexOf('<', pos);
        if (tagStart === -1 || tagStart + 1 >= template.length) return false;

        // Skip closing tags and comments
        if (template[tagStart + 1] === '/' || template[tagStart + 1] === '!') {
            pos = tagStart + 2;
            continue;
        }

        // Check for valid tag name start
        if (!/[A-Za-z]/.test(template[tagStart + 1])) {
            pos = tagStart + 2;
            continue;
        }

        // Extract tag name
        let nameEnd = tagStart + 2;
        while (nameEnd < template.length && /[A-Za-z0-9-]/.test(template[nameEnd])) {
            nameEnd++;
        }
        const tagName = template.slice(tagStart + 1, nameEnd);

        // Find closing tag
        const closingPattern = `</${tagName}>`;
        if (template.toLowerCase().includes(closingPattern.toLowerCase())) {
            return true;
        }

        pos = nameEnd;
    }

    return false;
}
