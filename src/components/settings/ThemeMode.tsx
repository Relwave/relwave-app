import { Theme } from '@tauri-apps/api/window';
import { Check, LucideProps, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from "@/components/common/ThemeProvider";

export default function ThemeMode() {
    const { theme, setTheme } = useTheme();
    const themeOptions = [
        { value: "light", label: "Light", icon: Sun },
        { value: "dark", label: "Dark", icon: Moon },
        { value: "system", label: "System", icon: Monitor },
    ];

    return (
        <section className="border border-border/20 rounded-lg p-6 bg-background">
            <div className="flex items-center gap-2.5 mb-4">
                <Moon className="h-4 w-4 text-muted-foreground/60" />
                <div>
                    <h2 className="text-sm font-medium">Theme Mode</h2>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Choose between light and dark mode
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = theme === option.value;

                    return (
                        <button
                            key={option.value}
                            onClick={() => setTheme(option.value as Theme)}
                            className={`
                      relative p-4 rounded-lg border-2 transition-all
                      ${isActive
                                    ? "border-primary bg-primary/5"
                                    : "border-border/20 hover:border-border/40 bg-background"
                                }
                    `}
                        >
                            <div className="flex flex-col items-center gap-2">
                                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                                <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                                    {option.label}
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

