export type ThemeVariant = 'blue' | 'slate' | 'green' | 'purple' | 'orange' | 'rose';

export interface ThemeVariantConfig {
    name: string;
    primary: string;
    primaryForeground: string;
    ring: string;
}

export const themeVariants: Record<ThemeVariant, ThemeVariantConfig> = {
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
};

export const defaultVariant: ThemeVariant = 'blue';
