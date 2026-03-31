import { useThemeVariant } from '@/hooks/useThemeVariant';
import { themeVariants, ThemeVariant } from "@/lib/themes";
import { Check, Palette } from 'lucide-react';

export default function ColorVariant() {

    const { variant, setVariant } = useThemeVariant();
    return (
        <section className="border border-border/20 rounded-lg p-6 bg-background">
            <div className="flex items-center gap-2.5 mb-4">
                <Palette className="h-4 w-4 text-muted-foreground/60" />
                <div>
                    <h2 className="text-sm font-medium">Accent Color</h2>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Select your preferred color theme
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(themeVariants).map(([key, config]) => {
                    const isActive = variant === key;

                    return (
                        <button
                            key={key}
                            onClick={() => setVariant(key as ThemeVariant)}
                            className={`
                      relative p-4 rounded-lg border-2 transition-all
                      ${isActive
                                    ? "border-primary bg-primary/5"
                                    : "border-border/20 hover:border-border/40 bg-background"
                                }
                    `}
                        >
                            <div className="flex flex-col items-center gap-2.5">
                                <div
                                    className="h-10 w-10 rounded-full border-2 border-background shadow-sm"
                                    style={{ backgroundColor: config.primary }}
                                />
                                <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
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
                })}
            </div>
        </section>
    )
}