import { useThemeVariant } from '@/features/settings/hooks/useThemeVariant';
import { themeVariants, ThemeVariant } from "@/lib/themes";
import { Check, Palette, Layers } from 'lucide-react';

const ACCENT_THEMES: ThemeVariant[] = ['blue', 'slate', 'green', 'purple', 'orange', 'rose'];
const FULL_THEMES: ThemeVariant[] = ['cyberpunk', 'vscode'];

interface ThemeCardProps {
    themeKey: ThemeVariant;
    isActive: boolean;
    onSelect: () => void;
}

function ThemeCard({ themeKey, isActive, onSelect }: ThemeCardProps) {
    const config = themeVariants[themeKey];

    if (config.fullPalette) {
        // Rich preview card for full-palette themes
        return (
            <button
                onClick={onSelect}
                className={`
                    relative p-0 rounded-xl border-2 overflow-hidden transition-all duration-200
                    ${isActive
                        ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                        : 'border-border/30 hover:border-border/60 hover:shadow-md'
                    }
                `}
            >
                {/* Preview banner */}
                <div
                    className="h-14 w-full"
                    style={{ background: config.previewGradient ?? config.primary }}
                />
                {/* Mini chrome mockup */}
                <div
                    className="px-3 py-2.5 flex flex-col gap-1.5"
                    style={{
                        background: config.palette?.background ?? '#1e1e1e',
                        borderTop: `1px solid ${config.palette?.border ?? '#333'}`,
                    }}
                >
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ background: config.palette?.primary }} />
                        <div className="h-1.5 rounded-full flex-1" style={{ background: config.palette?.muted, opacity: 0.6 }} />
                    </div>
                    <div className="h-1.5 rounded-full w-3/4" style={{ background: config.palette?.mutedForeground, opacity: 0.2 }} />
                    <div className="h-1.5 rounded-full w-1/2" style={{ background: config.palette?.mutedForeground, opacity: 0.15 }} />
                </div>

                {/* Label */}
                <div
                    className="px-3 pb-2.5 flex items-center justify-between"
                    style={{ background: config.palette?.background ?? '#1e1e1e' }}
                >
                    <div>
                        <p className="text-xs font-semibold" style={{ color: config.palette?.foreground ?? '#fff' }}>
                            {config.name}
                        </p>
                        {config.description && (
                            <p className="text-[10px]" style={{ color: config.palette?.mutedForeground ?? '#888' }}>
                                {config.description}
                            </p>
                        )}
                    </div>
                    <Layers className="h-3 w-3 shrink-0" style={{ color: config.palette?.primary ?? config.primary }} />
                </div>

                {isActive && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                        <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                )}
            </button>
        );
    }

    // Simple swatch card for accent-only themes
    return (
        <button
            onClick={onSelect}
            className={`
                relative p-4 rounded-lg border transition-all duration-150
                ${isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border/20 hover:border-border/40 bg-background'
                }
            `}
        >
            <div className="flex flex-col items-center gap-2.5">
                <div
                    className="h-10 w-10 rounded-full border-2 border-background shadow-sm"
                    style={{ backgroundColor: config.primary }}
                />
                <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {config.name}
                </span>
            </div>
            {isActive && (
                <div className="absolute top-2 right-2">
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                </div>
            )}
        </button>
    );
}

export default function ColorVariant() {
    const { variant, setVariant } = useThemeVariant();

    return (
        <section className="border border-border/50 rounded-lg p-6 bg-card/65 shadow-sm backdrop-blur-sm space-y-6">
            <div className="flex items-center gap-2.5">
                <Palette className="h-4 w-4 text-muted-foreground/60" />
                <div>
                    <h2 className="text-sm font-medium">Theme</h2>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Choose an accent color or a full UI theme
                    </p>
                </div>
            </div>

            {/* Accent colors */}
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">
                    Accent Colors
                </p>
                <div className="grid grid-cols-3 gap-3">
                    {ACCENT_THEMES.map((key) => (
                        <ThemeCard
                            key={key}
                            themeKey={key}
                            isActive={variant === key}
                            onSelect={() => setVariant(key)}
                        />
                    ))}
                </div>
            </div>

            {/* Full palette themes */}
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">
                    Full Themes
                </p>
                <div className="grid grid-cols-2 gap-3">
                    {FULL_THEMES.map((key) => (
                        <ThemeCard
                            key={key}
                            themeKey={key}
                            isActive={variant === key}
                            onSelect={() => setVariant(key)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
