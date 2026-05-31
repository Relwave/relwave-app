import { useEffect, useState } from 'react';
import { ThemeVariant, ThemePalette, defaultVariant, themeVariants } from '@/lib/themes';

const STORAGE_KEY = 'relwave-theme-variant';

/** CSS variable names that map 1-to-1 to ThemePalette keys */
const PALETTE_CSS_VARS: Array<[keyof ThemePalette, string]> = [
    ['background',                '--background'],
    ['foreground',                '--foreground'],
    ['card',                      '--card'],
    ['cardForeground',            '--card-foreground'],
    ['popover',                   '--popover'],
    ['popoverForeground',         '--popover-foreground'],
    ['primary',                   '--primary'],
    ['primaryForeground',         '--primary-foreground'],
    ['secondary',                 '--secondary'],
    ['secondaryForeground',       '--secondary-foreground'],
    ['muted',                     '--muted'],
    ['mutedForeground',           '--muted-foreground'],
    ['accent',                    '--accent'],
    ['accentForeground',          '--accent-foreground'],
    ['destructive',               '--destructive'],
    ['border',                    '--border'],
    ['input',                     '--input'],
    ['ring',                      '--ring'],
    ['sidebar',                   '--sidebar'],
    ['sidebarForeground',         '--sidebar-foreground'],
    ['sidebarPrimary',            '--sidebar-primary'],
    ['sidebarPrimaryForeground',  '--sidebar-primary-foreground'],
    ['sidebarAccent',             '--sidebar-accent'],
    ['sidebarAccentForeground',   '--sidebar-accent-foreground'],
    ['sidebarBorder',             '--sidebar-border'],
    ['sidebarRing',               '--sidebar-ring'],
    ['cardShadow',                '--card-shadow'],
    ['glassBg',                   '--glass-bg'],
    ['surface',                   '--surface'],
    ['surfaceElevated',           '--surface-elevated'],
    ['surfaceSubtle',             '--surface-subtle'],
    ['borderSubtle',              '--border-subtle'],
];

/** All CSS var names that a full-palette theme can set (used for cleanup when switching away) */
const ALL_PALETTE_CSS_VARS = PALETTE_CSS_VARS.map(([, cssVar]) => cssVar);

function isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark');
}

function applyPalette(root: HTMLElement, palette: ThemePalette) {
    for (const [key, cssVar] of PALETTE_CSS_VARS) {
        const value = palette[key];
        if (value !== undefined) {
            root.style.setProperty(cssVar, value as string);
        }
    }
    // Sidebar primary/ring: use explicit palette overrides when present,
    // otherwise fall back to the main primary/ring values.
    if (!palette.sidebarPrimary && palette.primary) {
        root.style.setProperty('--sidebar-primary', palette.primary);
    }
    if (!palette.sidebarRing) {
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

/**
 * Resolve which palette to apply for a given variant, respecting dark mode.
 * Priority: lightPalette/darkPalette (mode-aware) → palette (single always-on) → null
 */
function resolvePalette(variant: ThemeVariant): ThemePalette | null {
    const config = themeVariants[variant];
    if (!config.fullPalette) return null;

    const dark = isDarkMode();

    // Mode-aware themes (e.g. Valorant)
    if (config.lightPalette && config.darkPalette) {
        return dark ? config.darkPalette : config.lightPalette;
    }

    // Single-mode themes (e.g. Cyberpunk, VS Code — always dark)
    if (config.palette) {
        return config.palette;
    }

    return null;
}

export function useThemeVariant() {
    const [variant, setVariantState] = useState<ThemeVariant>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return (stored as ThemeVariant) || defaultVariant;
    });

    useEffect(() => {
        const root = document.documentElement;

        const applyTheme = () => {
            // Always update the data attribute so CSS [data-theme-variant] selectors still work
            root.setAttribute('data-theme-variant', variant);

            const palette = resolvePalette(variant);
            if (palette) {
                applyPalette(root, palette);
            } else {
                // Accent-only theme: remove any full-palette inline overrides so the
                // base :root / .dark stylesheet variables resume control.
                clearPalette(root);
            }
        };

        // Apply immediately
        applyTheme();

        // For mode-aware full-palette themes, watch for .dark class toggling on <html>
        // so we can swap lightPalette ↔ darkPalette without a page reload.
        const config = themeVariants[variant];
        if (config.fullPalette && config.lightPalette && config.darkPalette) {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (
                        mutation.type === 'attributes' &&
                        mutation.attributeName === 'class'
                    ) {
                        applyTheme();
                        break;
                    }
                }
            });
            observer.observe(root, { attributes: true, attributeFilter: ['class'] });
            return () => observer.disconnect();
        }
    }, [variant]);

    const setVariant = (newVariant: ThemeVariant) => {
        localStorage.setItem(STORAGE_KEY, newVariant);
        setVariantState(newVariant);
    };

    return { variant, setVariant };
}
