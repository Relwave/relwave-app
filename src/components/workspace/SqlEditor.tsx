import { FC, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@/components/common/ThemeProvider";

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
    backgroundColor: "hsl(var(--muted) / 0.3)",
    borderRadius: "0.5rem",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
    borderRight: "1px solid hsl(var(--border))",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--muted))",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.2) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.3) !important",
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
