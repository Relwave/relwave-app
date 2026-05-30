import { useEffect, useState } from 'react';
import { ThemeVariant, ThemePalette, defaultVariant, themeVariants } from '@/lib/themes';

const STORAGE_KEY = 'relwave-theme-variant';

/** CSS variable names that map 1-to-1 to ThemePalette keys */
const PALETTE_CSS_VARS: Array<[keyof ThemePalette, string]> = [
    ['background',              '--background'],
    ['foreground',              '--foreground'],
    ['card',                    '--card'],
    ['cardForeground',          '--card-foreground'],
    ['popover',                 '--popover'],
    ['popoverForeground',       '--popover-foreground'],
    ['primary',                 '--primary'],
    ['primaryForeground',       '--primary-foreground'],
    ['secondary',               '--secondary'],
    ['secondaryForeground',     '--secondary-foreground'],
    ['muted',                   '--muted'],
    ['mutedForeground',         '--muted-foreground'],
    ['accent',                  '--accent'],
    ['accentForeground',        '--accent-foreground'],
    ['destructive',             '--destructive'],
    ['border',                  '--border'],
    ['input',                   '--input'],
    ['ring',                    '--ring'],
    ['sidebar',                 '--sidebar'],
    ['sidebarForeground',       '--sidebar-foreground'],
    ['sidebarAccent',           '--sidebar-accent'],
    ['sidebarAccentForeground', '--sidebar-accent-foreground'],
    ['sidebarBorder',           '--sidebar-border'],
    ['cardShadow',              '--card-shadow'],
    ['glassBg',                 '--glass-bg'],
    ['surface',                 '--surface'],
    ['surfaceElevated',         '--surface-elevated'],
    ['surfaceSubtle',           '--surface-subtle'],
    ['borderSubtle',            '--border-subtle'],
];

/** CSS variable names that the data-theme-variant attribute overrides for simple accent themes */
const ACCENT_ONLY_VARS = ['--primary', '--primary-foreground', '--ring', '--sidebar-primary', '--sidebar-ring'];

/** All CSS var names that a full-palette theme can set (used for cleanup when switching away) */
const ALL_PALETTE_CSS_VARS = PALETTE_CSS_VARS.map(([, cssVar]) => cssVar);

function applyPalette(root: HTMLElement, palette: ThemePalette) {
    for (const [key, cssVar] of PALETTE_CSS_VARS) {
        const value = palette[key];
        if (value !== undefined) {
            root.style.setProperty(cssVar, value as string);
        }
    }
    // Sidebar primary/ring mirror the primary by default
    if (palette.primary) {
        root.style.setProperty('--sidebar-primary', palette.primary);
        root.style.setProperty('--sidebar-ring', palette.ring ?? palette.primary);
    }
}

function clearPalette(root: HTMLElement) {
    for (const cssVar of ALL_PALETTE_CSS_VARS) {
        root.style.removeProperty(cssVar);
    }
    root.style.removeProperty('--sidebar-primary');
    root.style.removeProperty('--sidebar-ring');
}

export function useThemeVariant() {
    const [variant, setVariantState] = useState<ThemeVariant>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return (stored as ThemeVariant) || defaultVariant;
    });

    useEffect(() => {
        const root = document.documentElement;
        const config = themeVariants[variant];

        // Always update the data attribute so CSS [data-theme-variant] selectors still work
        root.setAttribute('data-theme-variant', variant);

        if (config.fullPalette && config.palette) {
            // Full-palette theme: inject all variables via inline style overrides.
            // Clear first to remove any previously set accent-only vars.
            clearPalette(root);
            applyPalette(root, config.palette);
        } else {
            // Accent-only theme: remove any full-palette overrides from a previous
            // full-palette theme so the base :root / .dark variables take over again.
            clearPalette(root);
        }
    }, [variant]);

    const setVariant = (newVariant: ThemeVariant) => {
        localStorage.setItem(STORAGE_KEY, newVariant);
        setVariantState(newVariant);
    };

    return { variant, setVariant };
}
