import { useTheme } from "@/components/providers/ThemeProvider";
import type { Theme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

export default function ThemeMode() {
    const { theme, setTheme } = useTheme();
    const themeOptions = [
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "system", label: "System" },
    ];

    return (
        <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Theme</h3>
            <div className="flex items-center gap-2">
                {themeOptions.map((option) => {
                    const isActive = theme === option.value;
                    return (
                        <button
                            key={option.value}
                            onClick={() => setTheme(option.value as Theme)}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-md transition-all border",
                                isActive 
                                    ? "bg-primary/20 text-primary border-primary" 
                                    : "bg-transparent text-muted-foreground border-border/20 hover:border-border/40 hover:text-foreground"
                            )}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
