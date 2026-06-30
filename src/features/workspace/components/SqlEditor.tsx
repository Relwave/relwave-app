import { FC, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@/components/providers/ThemeProvider";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: string;
  dialect?: "postgresql" | "mysql";
}

// Light theme customization
const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "color-mix(in oklch, var(--muted) 30%, transparent)",
    borderRadius: "0.5rem",
  },
  ".cm-gutters": {
    backgroundColor: "color-mix(in oklch, var(--muted) 50%, transparent)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--muted)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--muted) 50%, transparent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 30%, transparent) !important",
  },
  "&.cm-focused .cm-selectionBackground, &.cm-focused .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 40%, transparent) !important",
  },
});

// Dark theme customization (extends oneDark)
const darkThemeExtension = EditorView.theme({
  "&": {
    borderRadius: "0.5rem",
  },
  ".cm-gutters": {
    borderRight: "1px solid hsl(var(--border))",
  },
});

const SqlEditor: FC<SqlEditorProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = "-- Enter your SQL query here\nSELECT * FROM users;",
  minHeight = "200px",
  dialect = "postgresql",
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleChange = useCallback(
    (val: string) => {
      if (!disabled) {
        onChange(val);
      }
    },
    [onChange, disabled]
  );

  // Select SQL dialect
  const sqlDialect = dialect === "mysql" ? MySQL : PostgreSQL;

  const extensions = [
    sql({ dialect: sqlDialect }),
    EditorView.lineWrapping,
    EditorView.editable.of(!disabled),
    isDark ? darkThemeExtension : lightTheme,
  ];

  return (
    <div className="relative border rounded-lg overflow-hidden">
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        theme={isDark ? oneDark : "light"}
        placeholder={placeholder}
        minHeight={minHeight}
        editable={!disabled}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
        }}
        className="text-sm"
      />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded pointer-events-none">
        {value.length} chars
      </div>
    </div>
  );
};

export { SqlEditor };
