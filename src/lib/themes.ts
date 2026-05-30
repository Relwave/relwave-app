export type ThemeVariant =
    | 'blue' | 'slate' | 'green' | 'purple' | 'orange' | 'rose'
    | 'cyberpunk' | 'vscode';

export interface ThemeVariantConfig {
    name: string;
    description?: string;
    /** Swatch color shown in the picker */
    primary: string;
    primaryForeground: string;
    ring: string;
    /** If true, this theme overrides the full palette (not just the accent) */
    fullPalette?: boolean;
    /** Dark-mode palette override. Only used when fullPalette=true. */
    palette?: ThemePalette;
    /** Optional gradient/icon style for the picker card */
    previewGradient?: string;
}

export interface ThemePalette {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    border: string;
    input: string;
    ring: string;
    sidebar: string;
    sidebarForeground: string;
    sidebarAccent: string;
    sidebarAccentForeground: string;
    sidebarBorder: string;
    cardShadow?: string;
    glassBg?: string;
    surface?: string;
    surfaceElevated?: string;
    surfaceSubtle?: string;
    borderSubtle?: string;
}

export const themeVariants: Record<ThemeVariant, ThemeVariantConfig> = {
    // ── Standard accent-only themes ──────────────────────────────────────────
    blue: {
        name: 'Blue',
        primary: 'oklch(0.7 0.15 250)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.7 0.15 250)',
    },
    slate: {
        name: 'Slate',
        primary: 'oklch(0.6 0.015 250)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.6 0.015 250)',
    },
    green: {
        name: 'Green',
        primary: 'oklch(0.65 0.18 160)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.65 0.18 160)',
    },
    purple: {
        name: 'Purple',
        primary: 'oklch(0.65 0.25 290)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.65 0.25 290)',
    },
    orange: {
        name: 'Orange',
        primary: 'oklch(0.7 0.18 60)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.7 0.18 60)',
    },
    rose: {
        name: 'Rose',
        primary: 'oklch(0.7 0.22 10)',
        primaryForeground: 'oklch(0.98 0 0)',
        ring: 'oklch(0.7 0.22 10)',
    },

    // ── Full-palette themes ───────────────────────────────────────────────────

    /**
     * Cyberpunk
     * Electric neon-cyan on a near-black background with magenta accents.
     * Always dark — ignores the system light/dark toggle.
     */
    cyberpunk: {
        name: 'Cyberpunk',
        description: 'Neon cyan & magenta on deep dark',
        primary: '#00f5ff',
        primaryForeground: '#000',
        ring: '#00f5ff',
        fullPalette: true,
        previewGradient: 'linear-gradient(135deg, #00f5ff 0%, #ff00c8 100%)',
        palette: {
            background:            '#070b14',
            foreground:            '#e2f0ff',
            card:                  '#0d1526',
            cardForeground:        '#e2f0ff',
            popover:               '#0d1526',
            popoverForeground:     '#e2f0ff',
            primary:               '#00f5ff',
            primaryForeground:     '#030c12',
            secondary:             '#0f1e35',
            secondaryForeground:   '#a8cfef',
            muted:                 '#0d1a2e',
            mutedForeground:       '#6a8faf',
            accent:                '#ff00c8',
            accentForeground:      '#fff',
            destructive:           '#ff3366',
            border:                '#0e2540',
            input:                 '#0a1a2e',
            ring:                  '#00f5ff',
            sidebar:               '#060d1c',
            sidebarForeground:     '#cde8ff',
            sidebarAccent:         '#0f2240',
            sidebarAccentForeground: '#00f5ff',
            sidebarBorder:         'rgba(0,245,255,0.08)',
            cardShadow:            '0 0 0 1px rgba(0,245,255,0.06), 0 8px 32px rgba(0,0,0,0.6)',
            glassBg:               'rgba(7,11,20,0.85)',
            surface:               '#0a1220',
            surfaceElevated:       '#0d1526',
            surfaceSubtle:         '#0f1d32',
            borderSubtle:          'rgba(0,245,255,0.07)',
        },
    },

    /**
     * VS Code
     * Faithful recreation of VS Code's default Dark+ palette.
     * Deep navy backgrounds, cool gray text, blue accent.
     */
    vscode: {
        name: 'VS Code',
        description: 'Inspired by VS Code Dark+',
        primary: '#569cd6',
        primaryForeground: '#1e1e1e',
        ring: '#569cd6',
        fullPalette: true,
        previewGradient: 'linear-gradient(135deg, #1e1e1e 0%, #264f78 50%, #569cd6 100%)',
        palette: {
            background:            '#1e1e1e',
            foreground:            '#d4d4d4',
            card:                  '#252526',
            cardForeground:        '#d4d4d4',
            popover:               '#2d2d30',
            popoverForeground:     '#d4d4d4',
            primary:               '#569cd6',
            primaryForeground:     '#1e1e1e',
            secondary:             '#2d2d30',
            secondaryForeground:   '#cccccc',
            muted:                 '#333333',
            mutedForeground:       '#808080',
            accent:                '#264f78',
            accentForeground:      '#d4d4d4',
            destructive:           '#f44747',
            border:                '#3e3e42',
            input:                 '#3c3c3c',
            ring:                  '#569cd6',
            sidebar:               '#252526',
            sidebarForeground:     '#bbbbbb',
            sidebarAccent:         '#37373d',
            sidebarAccentForeground: '#ffffff',
            sidebarBorder:         '#3e3e42',
            cardShadow:            '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)',
            glassBg:               'rgba(37,37,38,0.92)',
            surface:               '#252526',
            surfaceElevated:       '#2d2d30',
            surfaceSubtle:         '#333333',
            borderSubtle:          '#3e3e42',
        },
    },
};

export const defaultVariant: ThemeVariant = 'blue';
