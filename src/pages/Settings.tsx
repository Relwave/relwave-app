import { useTheme } from "@/components/common/ThemeProvider";
import { useThemeVariant } from "@/hooks/useThemeVariant";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { themeVariants, ThemeVariant } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Palette, Moon, Sun, Monitor, Check, Code2, Bug } from "lucide-react";
import VerticalIconBar from "@/components/common/VerticalIconBar";

const Settings = () => {
    const { theme, setTheme } = useTheme();
    const { variant, setVariant } = useThemeVariant();
    const { isEnabled: devModeEnabled, setIsEnabled: setDevModeEnabled } = useDeveloperMode();

    const themeOptions = [
        { value: "light", label: "Light", icon: Sun },
        { value: "dark", label: "Dark", icon: Moon },
        { value: "system", label: "System", icon: Monitor },
    ] as const;

    return (
        <div className="h-full flex bg-background text-foreground overflow-hidden">
            <VerticalIconBar />

            <main className="flex-1 ml-[60px]">
                {/* Header */}
                <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm">
                    <div className="container mx-auto px-8 py-6">
                        <div>
                            <h1 className="text-2xl font-semibold">Settings</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Customize your app appearance
                            </p>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="container mx-auto px-8 py-8 max-w-4xl">
                    <div className="space-y-8">
                        {/* Theme Mode Section */}
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
                                            onClick={() => setTheme(option.value)}
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

                        {/* Color Variant Section */}
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

                        {/* Developer Mode Section */}
                        <section className="border border-border/20 rounded-lg p-6 bg-background">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Code2 className="h-4 w-4 text-muted-foreground/60" />
                                    <div>
                                        <h2 className="text-sm font-medium">Developer Mode</h2>
                                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                                            Enable developer tools and context menu options
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={devModeEnabled}
                                    onCheckedChange={setDevModeEnabled}
                                />
                            </div>
                            
                            {devModeEnabled && (
                                <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/20">
                                    <div className="flex items-start gap-2">
                                        <Bug className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                        <div className="text-xs text-muted-foreground">
                                            <p className="font-medium text-foreground mb-1">Developer features enabled:</p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                <li>Right-click context menu with Inspect, Reload, Back/Forward</li>
                                                <li>Access to browser developer tools (F12)</li>
                                                <li>Keyboard shortcuts for navigation</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Preview Section */}
                        <section className="border border-border/20 rounded-lg p-6 bg-background">
                            <h2 className="text-sm font-medium mb-4">Preview</h2>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <Button size="sm" className="text-xs">
                                        Primary Button
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs">
                                        Outline Button
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs">
                                        Ghost Button
                                    </Button>
                                </div>
                                <div className="p-3 border border-border/20 rounded-md">
                                    <p className="text-sm text-muted-foreground">
                                        This is a preview of how text and UI elements will look with your selected theme.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Settings;
