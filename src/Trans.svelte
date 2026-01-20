<script lang="ts">
    /**
     * Trans - Simple translation component
     *
     * Renders translations as plain text. Svelte automatically escapes
     * content in {...} interpolation, preventing XSS attacks.
     * For rich content with components, use TransRich instead.
     *
     * @example
     * <Trans key="welcome.message" {t} name="John" />
     *
     * @example With reactive params
     * <Trans key="items.count" {t} count={items.length} />
     */

    /**
     * HTML/SVG attributes that should NOT be passed to the translation function.
     * These are forwarded to the wrapper element instead.
     *
     * This is a protective measure - translations should use semantic names like
     * {{userName}} instead of {{class}} to avoid confusion with HTML attributes.
     *
     * NOTE: All attributes listed here MUST also be destructured in $props()
     * and included in wrapperAttrs to ensure they reach the DOM.
     */
    const RESERVED_HTML_ATTRIBUTES = new Set([
        // Common HTML attributes
        'class', 'style', 'id', 'title', 'lang', 'dir',
        // ARIA attributes (critical for accessibility)
        'role', 'aria-label', 'aria-hidden', 'aria-describedby',
        // Data attributes prefix check is handled separately
        // Event handlers are already filtered by type check (functions)
    ]);

    /**
     * Check if a prop name is a reserved HTML attribute that shouldn't be
     * passed as an interpolation parameter.
     */
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
        /** Additional interpolation params (spread props) */
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
        // Everything else goes to translation params
        ...restParams
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

    // Reactively build params object - must use $derived.by to re-run when props change
    let typedParams = $derived.by(() => {
        const p: Record<string, string | number | Date> = {};

        // First, add explicit params if provided
        if (explicitParams) {
            Object.assign(p, explicitParams);
        }

        // Then, add rest params (spread props), excluding reserved HTML attributes
        // to prevent accidental collisions with translation placeholders
        for (const [k, v] of Object.entries(restParams)) {
            if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
                // Skip reserved HTML attributes like class, style, id, data-*
                if (!isReservedAttribute(k)) {
                    p[k] = v;
                }
            }
        }

        return Object.keys(p).length > 0 ? p : undefined;
    });

    let content = $derived(t(key, typedParams));
</script>

<!-- Wrapper element with forwarded HTML attributes (class, style, id, etc.) -->
<svelte:element this={as} {...wrapperAttrs}>{content}</svelte:element>
