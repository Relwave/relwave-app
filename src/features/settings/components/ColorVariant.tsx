import { Check } from "lucide-react";
import { useThemeVariant } from "@/features/settings/hooks/useThemeVariant";
import { themeVariants, ThemeVariant } from "@/lib/themes";
import { cn } from "@/lib/utils";

const ACCENT_THEMES: ThemeVariant[] = ["blue", "slate", "green", "purple", "orange", "rose"];

export default function ColorVariant() {
  const { variant, setVariant } = useThemeVariant();

  return (
    <section className="space-y-3">
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
                "w-7 h-7 rounded-full transition-all flex items-center justify-center cursor-pointer shadow-sm",
                isActive
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                  : "hover:scale-110 opacity-85 hover:opacity-100",
              )}
              style={{ backgroundColor: config.primary }}
              title={config.name}
              aria-label={`Select ${config.name} accent`}
            >
              {isActive && (
                <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
