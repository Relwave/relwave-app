import { createContext, useContext, useEffect, useState } from "react"
import { flushSync } from "react-dom"

export type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function getSystemTheme(): Exclude<Theme, "system"> {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
}

function applyTheme(theme: Theme) {
    const root = window.document.documentElement
    const resolvedTheme = theme === "system" ? getSystemTheme() : theme
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
}

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "relwave:theme",
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = (localStorage.getItem(storageKey) as Theme) || defaultTheme
        applyTheme(stored)
        return stored
    })

    useEffect(() => {
        applyTheme(theme)
    }, [theme])

    useEffect(() => {
        if (theme !== "system") return

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const handleSystemThemeChange = () => applyTheme("system")

        mediaQuery.addEventListener("change", handleSystemThemeChange)
        return () => mediaQuery.removeEventListener("change", handleSystemThemeChange)
    }, [theme])

    const value = {
        theme,
        setTheme: (newTheme: Theme) => {
            const root = window.document.documentElement

            if (!document.startViewTransition) {
                localStorage.setItem(storageKey, newTheme)
                applyTheme(newTheme)
                setTheme(newTheme)
                return
            }

            root.classList.add("theme-transitioning")

            const transition = document.startViewTransition(() => {
                localStorage.setItem(storageKey, newTheme)
                flushSync(() => {
                    applyTheme(newTheme)
                    setTheme(newTheme)
                })
            })

            transition.ready.catch(() => {
                root.classList.remove("theme-transitioning")
            })

            transition.finished.finally(() => {
                root.classList.remove("theme-transitioning")
            })
        },
    }

    return (
        <ThemeProviderContext.Provider value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}