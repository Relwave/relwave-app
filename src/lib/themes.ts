export type ThemeVariant =
    | 'blue' | 'slate' | 'green' | 'purple' | 'orange' | 'rose'
    | 'cyberpunk' | 'vscode' | 'valorant' | 'ghibli';

export interface ThemeVariantConfig {
    name: string;
    description?: string;
    /** Swatch color shown in the picker */
    primary: string;
    primaryForeground: string;
    ring: string;
    /** If true, this theme overrides the full palette (not just the accent) */
    fullPalette?: boolean;
    /**
     * Single palette applied regardless of light/dark mode.
     * Used by themes that are always dark (Cyberpunk, VS Code).
     */
    palette?: ThemePalette;
    /**
     * Light-mode palette. When set alongside darkPalette, the hook will
     * automatically switch between them as the user toggles light/dark mode.
     */
    lightPalette?: ThemePalette;
    /** Dark-mode palette. Used together with lightPalette. */
    darkPalette?: ThemePalette;
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
    /** Overrides --sidebar-primary. Falls back to `primary` when omitted. */
    sidebarPrimary?: string;
    sidebarPrimaryForeground?: string;
    sidebarAccent: string;
    sidebarAccentForeground: string;
    sidebarBorder: string;
    /** Overrides --sidebar-ring. Falls back to `ring` when omitted. */
    sidebarRing?: string;
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

    /**
     * Valorant
     * Inspired by Riot Games' Valorant UI — vivid red-orange primary on warm
     * cream/rose backgrounds in light mode; deep dark reddish tones in dark mode.
     * Supports both light and dark modes, switching automatically with the toggle.
     */
    valorant: {
        name: 'Valorant',
        description: 'Riot red on warm cream & dark',
        primary: 'oklch(0.67 0.22 21.34)',
        primaryForeground: 'oklch(0.99 0 360)',
        ring: 'oklch(0.92 0.04 12.39)',
        fullPalette: true,
        previewGradient: 'linear-gradient(135deg, oklch(0.97 0.02 12.78) 0%, oklch(0.67 0.22 21.34) 50%, oklch(0.16 0.03 17.48) 100%)',
        // Light palette — warm cream/rose base with Valorant red accent
        lightPalette: {
            background:            'oklch(0.97 0.02 12.78)',
            foreground:            'oklch(0.24 0.07 17.81)',
            card:                  'oklch(0.98 0.01 17.28)',
            cardForeground:        'oklch(0.26 0.07 19)',
            popover:               'oklch(0.98 0.01 17.28)',
            popoverForeground:     'oklch(0.26 0.07 19)',
            primary:               'oklch(0.67 0.22 21.34)',
            primaryForeground:     'oklch(0.99 0.00 359.99)',
            secondary:             'oklch(0.95 0.02 11.28)',
            secondaryForeground:   'oklch(0.24 0.07 17.81)',
            muted:                 'oklch(0.98 0.01 17.28)',
            mutedForeground:       'oklch(0.55 0.08 19)',
            accent:                'oklch(0.99 0.00 359.99)',
            accentForeground:      'oklch(0.43 0.13 20.62)',
            destructive:           'oklch(0.80 0.17 73.27)',
            border:                'oklch(0.91 0.05 11.40)',
            input:                 'oklch(0.90 0.05 12.59)',
            ring:                  'oklch(0.92 0.04 12.39)',
            sidebar:               'oklch(0.97 0.02 12.78)',
            sidebarForeground:     'oklch(0.26 0.07 19)',
            sidebarAccent:         'oklch(0.98 0.01 17.28)',
            sidebarAccentForeground: 'oklch(0.43 0.13 20.62)',
            sidebarBorder:         'oklch(0.91 0.05 11.40)',
            cardShadow:            '0px 0px 3px 0px oklch(0.3 0.0891 19.6 / 0.08), 0px 2px 4px -1px oklch(0.3 0.0891 19.6 / 0.08)',
            glassBg:               'rgba(253, 248, 247, 0.82)',
            surface:               'oklch(0.97 0.02 12.78)',
            surfaceElevated:       'oklch(0.98 0.01 17.28)',
            surfaceSubtle:         'oklch(0.95 0.02 11.28)',
            borderSubtle:          'oklch(0.91 0.05 11.40)',
        },
        // Dark palette — deep near-black reddish backgrounds, same red accent
        darkPalette: {
            background:            'oklch(0.16 0.03 17.48)',
            foreground:            'oklch(0.99 0.00 359.99)',
            card:                  'oklch(0.21 0.05 19.26)',
            cardForeground:        'oklch(0.98 0 0)',
            popover:               'oklch(0.26 0.07 19)',
            popoverForeground:     'oklch(0.99 0.00 359.99)',
            primary:               'oklch(0.67 0.22 21.34)',
            primaryForeground:     'oklch(0.99 0.00 359.99)',
            secondary:             'oklch(0.3 0.0891 19.6)',
            secondaryForeground:   'oklch(0.95 0.02 11.28)',
            muted:                 'oklch(0.26 0.07 19)',
            mutedForeground:       'oklch(0.72 0.04 18)',
            accent:                'oklch(0.43 0.13 20.62)',
            accentForeground:      'oklch(0.99 0.00 359.99)',
            destructive:           'oklch(0.80 0.17 73.27)',
            border:                'oklch(0.31 0.09 19.80)',
            input:                 'oklch(0.39 0.12 20.37)',
            ring:                  'oklch(0.50 0.16 20.89)',
            sidebar:               'oklch(0.26 0.07 19)',
            sidebarForeground:     'oklch(0.99 0.00 359.99)',
            sidebarAccent:         'oklch(0.43 0.13 20.62)',
            sidebarAccentForeground: 'oklch(0.99 0.00 359.99)',
            sidebarBorder:         'oklch(0.39 0.12 20.37)',
            cardShadow:            '0 1px 3px 0px oklch(0.00 0 0 / 0.10), 0 2px 4px -1px oklch(0.00 0 0 / 0.10)',
            glassBg:               'rgba(33, 14, 12, 0.82)',
            surface:               'oklch(0.21 0.05 19.26)',
            surfaceElevated:       'oklch(0.26 0.07 19)',
            surfaceSubtle:         'oklch(0.3 0.0891 19.6)',
            borderSubtle:          'oklch(0.31 0.09 19.80)',
        },
    },

    /**
     * Ghibli Studio
     * Inspired by Studio Ghibli's warm, earthy colour palette — golden sandy
     * backgrounds with muted olive-green accents in light mode; deep dark warm
     * browns with sage green highlights in dark mode.
     * Supports both light and dark modes.
     */
    ghibli: {
        name: 'Ghibli',
        description: 'Earthy sage & golden warm tones',
        primary: 'oklch(0.71 0.10 111.99)',
        primaryForeground: 'oklch(0.98 0.01 3.71)',
        ring: 'oklch(0.51 0.08 74.26)',
        fullPalette: true,
        previewGradient: 'linear-gradient(135deg, oklch(0.91 0.05 82.69) 0%, oklch(0.71 0.10 111.99) 50%, oklch(0.20 0.01 48.35) 100%)',
        lightPalette: {
            background:              'oklch(0.91 0.05 82.69)',
            foreground:              'oklch(0.41 0.08 79.04)',
            card:                    'oklch(0.92 0.04 83.86)',
            cardForeground:          'oklch(0.41 0.08 73.75)',
            popover:                 'oklch(0.92 0.04 83.86)',
            popoverForeground:       'oklch(0.41 0.08 73.75)',
            primary:                 'oklch(0.71 0.10 111.99)',
            primaryForeground:       'oklch(0.98 0.01 3.71)',
            secondary:               'oklch(0.88 0.05 83.41)',
            secondaryForeground:     'oklch(0.51 0.08 79.21)',
            muted:                   'oklch(0.86 0.06 83.48)',
            mutedForeground:         'oklch(0.51 0.08 74.26)',
            accent:                  'oklch(0.86 0.05 84.50)',
            accentForeground:        'oklch(0.26 0.02 358.42)',
            destructive:             'oklch(0.63 0.24 29.21)',
            border:                  'oklch(0.74 0.06 79.81)',
            input:                   'oklch(0.74 0.06 79.81)',
            ring:                    'oklch(0.51 0.08 74.26)',
            sidebar:                 'oklch(0.87 0.06 83.96)',
            sidebarForeground:       'oklch(0.41 0.08 79.04)',
            sidebarPrimary:          'oklch(0.26 0.02 358.42)',
            sidebarPrimaryForeground: 'oklch(0.98 0.01 3.71)',
            sidebarAccent:           'oklch(0.83 0.06 84.46)',
            sidebarAccentForeground: 'oklch(0.26 0.02 358.42)',
            sidebarBorder:           'oklch(0.91 0.00 0.43)',
            sidebarRing:             'oklch(0.71 0.00 0.37)',
            cardShadow:              '0 1px 3px 0px oklch(0.00 0 0 / 0.08), 0 2px 4px -1px oklch(0.00 0 0 / 0.08)',
            glassBg:                 'rgba(244, 237, 216, 0.80)',
            surface:                 'oklch(0.91 0.05 82.69)',
            surfaceElevated:         'oklch(0.92 0.04 83.86)',
            surfaceSubtle:           'oklch(0.88 0.05 83.41)',
            borderSubtle:            'oklch(0.74 0.06 79.81)',
        },
        darkPalette: {
            background:              'oklch(0.20 0.01 48.35)',
            foreground:              'oklch(0.88 0.05 79.26)',
            card:                    'oklch(0.25 0.01 56.14)',
            cardForeground:          'oklch(0.88 0.05 79.26)',
            popover:                 'oklch(0.25 0.01 56.14)',
            popoverForeground:       'oklch(0.88 0.05 79.26)',
            primary:                 'oklch(0.64 0.05 115.39)',
            primaryForeground:       'oklch(0.98 0.01 3.71)',
            secondary:               'oklch(0.33 0.02 60.70)',
            secondaryForeground:     'oklch(0.88 0.05 83.41)',
            muted:                   'oklch(0.27 0.01 39.35)',
            mutedForeground:         'oklch(0.74 0.06 79.81)',
            accent:                  'oklch(0.33 0.02 60.70)',
            accentForeground:        'oklch(0.86 0.05 84.50)',
            destructive:             'oklch(0.63 0.24 29.21)',
            border:                  'oklch(0.33 0.02 60.70)',
            input:                   'oklch(0.33 0.02 60.70)',
            ring:                    'oklch(0.64 0.05 115.39)',
            sidebar:                 'oklch(0.23 0.01 56.09)',
            sidebarForeground:       'oklch(0.88 0.05 79.26)',
            sidebarPrimary:          'oklch(0.64 0.05 115.39)',
            sidebarPrimaryForeground: 'oklch(0.98 0.01 3.71)',
            sidebarAccent:           'oklch(0.33 0.02 60.70)',
            sidebarAccentForeground: 'oklch(0.86 0.05 84.50)',
            sidebarBorder:           'oklch(0.33 0.02 60.70)',
            sidebarRing:             'oklch(0.64 0.05 115.39)',
            cardShadow:              '0 1px 3px 0px oklch(0.00 0 0 / 0.20), 0 2px 4px -1px oklch(0.00 0 0 / 0.20)',
            glassBg:                 'rgba(33, 25, 14, 0.82)',
            surface:                 'oklch(0.25 0.01 56.14)',
            surfaceElevated:         'oklch(0.27 0.01 39.35)',
            surfaceSubtle:           'oklch(0.33 0.02 60.70)',
            borderSubtle:            'oklch(0.33 0.02 60.70)',
        },
    },
};

export const defaultVariant: ThemeVariant = 'blue';
