import React from "react";

export function TauriGuard({ children }: { children: React.ReactNode }) {
  const isTauri = typeof (window as any).__TAURI__ !== "undefined";
  if (!isTauri) {
    return (
      <div style={{ padding: 20, color: "#333" }}>
        <h3>Running in browser</h3>
        <p>
          This UI is running in a regular browser tab — Tauri runtime is not available.
          Start the app with <code>pnpm tauri dev</code> and use the native desktop window to
          access the bridge and database features.
        </p>
        <p style={{ marginTop: 12, color: "#666" }}>
          To test RPC from the renderer during dev, start the bridge manually:
        </p>
        <pre>cd bridge{'\n'}pnpm install{'\n'}pnpm dev</pre>
      </div>
    );
  }
  return <>{children}</>;
}
