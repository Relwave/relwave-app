import { FC, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { useTheme } from "@/components/providers/ThemeProvider";

export interface MongoCompletionItem {
  label: string;
  type: "keyword" | "function" | "type";
  detail?: string;
  boost?: number;
}

// SECURITY INVARIANT: Must NEVER suggest arbitrary code execution or write stages.
export const FORBIDDEN_AUTOCOMPLETE_OPERATORS = new Set([
  "$where",
  "$function",
  "$accumulator",
  "$out",
  "$merge",
]);

// JSON-ONLY CONTRACT: Mongosh constructors are NOT valid JSON syntax and are forbidden.
export const FORBIDDEN_CONSTRUCTOR_NAMES = new Set([
  "ObjectId",
  "ISODate",
  "NumberLong",
  "NumberDecimal",
  "UUID",
]);

const RAW_MONGO_COMPLETION_OPERATORS: MongoCompletionItem[] = [
  // Query operators
  { label: "$eq", type: "keyword", detail: "Matches values equal to specified value" },
  { label: "$gt", type: "keyword", detail: "Matches values greater than specified value" },
  {
    label: "$gte",
    type: "keyword",
    detail: "Matches values greater than or equal to specified value",
  },
  { label: "$in", type: "keyword", detail: "Matches any values specified in an array" },
  { label: "$lt", type: "keyword", detail: "Matches values less than specified value" },
  {
    label: "$lte",
    type: "keyword",
    detail: "Matches values less than or equal to specified value",
  },
  { label: "$ne", type: "keyword", detail: "Matches all values not equal to specified value" },
  { label: "$nin", type: "keyword", detail: "Matches none of values specified in array" },
  { label: "$and", type: "keyword", detail: "Joins query clauses with logical AND" },
  { label: "$not", type: "keyword", detail: "Inverts effect of a query expression" },
  { label: "$nor", type: "keyword", detail: "Joins query clauses with logical NOR" },
  { label: "$or", type: "keyword", detail: "Joins query clauses with logical OR" },
  { label: "$exists", type: "keyword", detail: "Matches documents that have the specified field" },
  { label: "$type", type: "keyword", detail: "Selects documents if field is of specified type" },
  { label: "$expr", type: "keyword", detail: "Allows use of aggregation expressions within query" },
  { label: "$jsonSchema", type: "keyword", detail: "Validate documents against given JSON Schema" },
  { label: "$mod", type: "keyword", detail: "Performs modulo operation on field value" },
  {
    label: "$regex",
    type: "keyword",
    detail: "Selects documents where values match regular expression",
  },
  { label: "$text", type: "keyword", detail: "Performs text search" },
  { label: "$all", type: "keyword", detail: "Matches arrays containing all elements specified" },
  {
    label: "$elemMatch",
    type: "keyword",
    detail: "Selects documents if element matches conditions",
  },
  { label: "$size", type: "keyword", detail: "Selects documents if array is specified size" },

  // Aggregation stages
  { label: "$match", type: "function", detail: "Filters documents to pass matching conditions" },
  { label: "$project", type: "function", detail: "Reshapes each document in stream" },
  { label: "$group", type: "function", detail: "Groups input documents by identifier expression" },
  { label: "$sort", type: "function", detail: "Reorders documents in stream" },
  { label: "$limit", type: "function", detail: "Passes first n documents unmodified" },
  { label: "$skip", type: "function", detail: "Skips first n documents" },
  { label: "$unwind", type: "function", detail: "Deconstructs array field from input documents" },
  {
    label: "$lookup",
    type: "function",
    detail: "Performs left outer join to an unsharded collection",
  },
  { label: "$addFields", type: "function", detail: "Adds new fields to documents" },
  { label: "$set", type: "function", detail: "Adds or updates document fields" },
  { label: "$unset", type: "function", detail: "Excludes fields from documents" },
  {
    label: "$replaceRoot",
    type: "function",
    detail: "Replaces input document with specified document",
  },
  { label: "$facet", type: "function", detail: "Processes multiple pipelines in a single stage" },
  {
    label: "$bucket",
    type: "function",
    detail: "Categorizes documents into groups based on boundaries",
  },
  {
    label: "$bucketAuto",
    type: "function",
    detail: "Categorizes documents into specific count of groups",
  },
  { label: "$count", type: "function", detail: "Passes document containing count of documents" },
  {
    label: "$sortByCount",
    type: "function",
    detail: "Groups documents and returns count of each group",
  },
  {
    label: "$geoNear",
    type: "function",
    detail: "Returns documents ordered by distance to a point",
  },
  { label: "$sample", type: "function", detail: "Randomly selects specified number of documents" },
  { label: "$densify", type: "function", detail: "Creates documents to eliminate gaps in data" },
  { label: "$fill", type: "function", detail: "Populates null and missing field values" },
  {
    label: "$setWindowFields",
    type: "function",
    detail: "Performs operations on window span of documents",
  },

  // Accumulators & expressions
  { label: "$sum", type: "function", detail: "Calculates collective sum of numeric values" },
  { label: "$avg", type: "function", detail: "Returns average value of numeric values" },
  { label: "$min", type: "function", detail: "Returns minimum value" },
  { label: "$max", type: "function", detail: "Returns maximum value" },
  { label: "$first", type: "function", detail: "Returns value from first document in group" },
  { label: "$last", type: "function", detail: "Returns value from last document in group" },
  {
    label: "$push",
    type: "function",
    detail: "Returns array of expression values for each document",
  },
  { label: "$addToSet", type: "function", detail: "Returns array of all unique values" },
  {
    label: "$cond",
    type: "function",
    detail: "Evaluates boolean expression to return one of two values",
  },
  {
    label: "$ifNull",
    type: "function",
    detail: "Evaluates expression and returns fallback if null/missing",
  },
  { label: "$switch", type: "function", detail: "Evaluates series of case expressions" },
  { label: "$concatArrays", type: "function", detail: "Concatenates arrays into a single array" },
  {
    label: "$mergeObjects",
    type: "function",
    detail: "Combines multiple documents into single document",
  },
  { label: "$toBool", type: "function", detail: "Converts value to boolean" },
  { label: "$toDate", type: "function", detail: "Converts value to Date" },
  { label: "$toDouble", type: "function", detail: "Converts value to double" },
  { label: "$toInt", type: "function", detail: "Converts value to integer" },
  { label: "$toLong", type: "function", detail: "Converts value to long" },
  { label: "$toString", type: "function", detail: "Converts value to string" },

  // Extended JSON v2 type representations (JSON-only input contract compliant)
  {
    label: "$oid",
    type: "type",
    detail: 'EJSON v2 24-character hex ObjectId wrapper: { "$oid": "..." }',
  },
  {
    label: "$date",
    type: "type",
    detail: 'EJSON v2 ISO-8601 Date or timestamp wrapper: { "$date": "..." }',
  },
  {
    label: "$numberLong",
    type: "type",
    detail: 'EJSON v2 64-bit integer wrapper: { "$numberLong": "..." }',
  },
  {
    label: "$numberDecimal",
    type: "type",
    detail: 'EJSON v2 128-bit decimal floating point wrapper: { "$numberDecimal": "..." }',
  },
  {
    label: "$binary",
    type: "type",
    detail: 'EJSON v2 Binary data wrapper: { "$binary": { "base64": "...", "subType": "00" } }',
  },
];

export const MONGO_COMPLETION_OPERATORS: MongoCompletionItem[] =
  RAW_MONGO_COMPLETION_OPERATORS.filter(
    (item) =>
      !FORBIDDEN_AUTOCOMPLETE_OPERATORS.has(item.label) &&
      !FORBIDDEN_CONSTRUCTOR_NAMES.has(item.label),
  );

export function getMongoCompletions(): MongoCompletionItem[] {
  return MONGO_COMPLETION_OPERATORS.filter(
    (item) =>
      !FORBIDDEN_AUTOCOMPLETE_OPERATORS.has(item.label) &&
      !FORBIDDEN_CONSTRUCTOR_NAMES.has(item.label),
  );
}

export function mongoCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\$?[a-zA-Z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: MONGO_COMPLETION_OPERATORS.map((item) => ({
      label: item.label,
      type: item.type,
      detail: item.detail,
    })),
  };
}

export const lightTheme = EditorView.theme({
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

export const darkThemeExtension = EditorView.theme({
  "&": {
    borderRadius: "0.5rem",
  },
  ".cm-gutters": {
    borderRight: "1px solid hsl(var(--border))",
  },
});

export interface MongoMqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: string;
  onExecute?: () => void;
  onSelectionChange?: (selectedText: string) => void;
}

export const MongoMqlEditor: FC<MongoMqlEditorProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = '{\n  "filter": {}\n}',
  minHeight = "200px",
  onExecute,
  onSelectionChange,
}) => {
  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (typeof window !== "undefined" &&
      theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleChange = useCallback(
    (val: string) => {
      if (!disabled) {
        onChange(val);
      }
    },
    [onChange, disabled],
  );

  const extensions = [
    json(),
    autocompletion({ override: [mongoCompletionSource] }),
    EditorView.lineWrapping,
    EditorView.editable.of(!disabled),
    ...(onExecute
      ? [
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                if (!disabled) {
                  onExecute();
                  return true;
                }
                return false;
              },
            },
          ]),
        ]
      : []),
    isDark ? darkThemeExtension : lightTheme,
  ];

  return (
    <div className="relative border rounded-lg overflow-hidden bg-background">
      <CodeMirror
        value={value}
        onChange={handleChange}
        onUpdate={(viewUpdate) => {
          if (onSelectionChange && (viewUpdate.selectionSet || viewUpdate.docChanged)) {
            const { from, to } = viewUpdate.state.selection.main;
            const selected = from !== to ? viewUpdate.state.sliceDoc(from, to) : "";
            onSelectionChange(selected);
          }
        }}
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
          autocompletion: false, // Handled explicitly via override
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
        }}
        className="text-sm font-mono"
      />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded pointer-events-none border border-border/40">
        {value.length} chars
      </div>
    </div>
  );
};
