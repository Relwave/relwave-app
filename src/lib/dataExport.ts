import { TableRow } from "@/types/database";

export type ExportFormat = "csv" | "json";

/**
 * Escape a value for CSV format
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles any quotes within the value
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // Check if we need to escape
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Convert an array of objects to CSV string
 */
export function convertToCSV(data: TableRow[], columns?: string[]): string {
  if (!data || data.length === 0) {
    return "";
  }

  // Get columns from first row if not provided
  const headers = columns || Object.keys(data[0]);

  // Create header row
  const headerRow = headers.map(escapeCSVValue).join(",");

  // Create data rows
  const dataRows = data.map((row) =>
    headers.map((header) => escapeCSVValue(row[header])).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Convert an array of objects to JSON string (data only)
 */
export function convertToJSON(data: TableRow[], columns?: string[]): string {
  if (!data || data.length === 0) {
    return "[]";
  }

  // If columns specified, filter to only include those columns
  if (columns && columns.length > 0) {
    const filteredData = data.map((row) => {
      const filteredRow: TableRow = {};
      columns.forEach((col) => {
        filteredRow[col] = row[col];
      });
      return filteredRow;
    });
    return JSON.stringify(filteredData, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Convert data to the specified format
 */
export function convertData(
  data: TableRow[],
  format: ExportFormat,
  columns?: string[]
): string {
  switch (format) {
    case "json":
      return convertToJSON(data, columns);
    case "csv":
    default:
      return convertToCSV(data, columns);
  }
}

/**
 * Get MIME type for export format
 */
export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case "json":
      return "application/json;charset=utf-8;";
    case "csv":
    default:
      return "text/csv;charset=utf-8;";
  }
}

/**
 * Get file extension for export format
 */
export function getFileExtension(format: ExportFormat): string {
  return format;
}

/**
 * Download a string as a file in the browser
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/csv;charset=utf-8;"
): void {
  // Add BOM for CSV files to help Excel with UTF-8
  const bom = mimeType.includes("csv") ? "\uFEFF" : "";
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Download table data in the specified format
 */
export function downloadTableData(
  data: TableRow[],
  tableName: string,
  format: ExportFormat = "csv",
  columns?: string[]
): void {
  const content = convertData(data, format, columns);
  const timestamp = new Date().toISOString().split("T")[0];
  const extension = getFileExtension(format);
  const mimeType = getMimeType(format);
  const filename = `${tableName}_${timestamp}.${extension}`;
  downloadFile(content, filename, mimeType);
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
