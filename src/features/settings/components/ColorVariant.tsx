import { useThemeVariant } from '@/features/settings/hooks/useThemeVariant';
import { themeVariants, ThemeVariant } from "@/lib/themes";
import { cn } from "@/lib/utils";

const ACCENT_THEMES: ThemeVariant[] = ['blue', 'slate', 'green', 'purple', 'orange', 'rose'];
const FULL_THEMES: ThemeVariant[] = ['cyberpunk', 'vscode', 'valorant', 'ghibli'];

export default function ColorVariant() {
    const { variant, setVariant } = useThemeVariant();

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Accent color</h3>
                <div className="flex items-center gap-3">
                    {ACCENT_THEMES.map((key) => {
                        const config = themeVariants[key];
                        const isActive = variant === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setVariant(key)}
                                className={cn(
                                    "w-7 h-7 rounded-full transition-all flex items-center justify-center",
                                    isActive ? "ring-2 ring-white ring-offset-2 ring-offset-background" : "hover:scale-110"
                                )}
                                style={{ backgroundColor: config.primary }}
                                title={config.name}
                                aria-label={`Select ${config.name} accent`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Keeping Full Themes as they are custom themes and valuable */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Full themes</h3>
                <div className="flex flex-wrap gap-2">
                    {FULL_THEMES.map((key) => {
                        const config = themeVariants[key];
                        const isActive = variant === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setVariant(key)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all border",
                                    isActive 
                                        ? "bg-primary/20 text-primary border-primary" 
                                        : "bg-transparent text-muted-foreground border-border/20 hover:border-border/40 hover:text-foreground"
                                )}
                            >
                                {config.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
