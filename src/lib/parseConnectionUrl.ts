/**
 * Parse a database connection URL into its components
 * Supports formats:
 * - postgres://user:password@host:port/database?sslmode=require
 * - postgresql://user:password@host:port/database
 * - mysql://user:password@host:port/database
 */

export interface ParsedConnectionUrl {
    type: string;
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    sslmode: string;
}

export function parseConnectionUrl(url: string): ParsedConnectionUrl | null {
    try {
        // Trim whitespace
        url = url.trim();

        // Handle empty string
        if (!url) return null;

        // Parse the URL
        const parsed = new URL(url);

        // Determine database type from protocol
        let type = "";
        const protocol = parsed.protocol.replace(":", "").toLowerCase();

        if (protocol === "postgres" || protocol === "postgresql") {
            type = "postgresql";
        } else if (protocol === "mysql") {
            type = "mysql";
        } else {
            return null; // Unsupported protocol
        }

        // Extract components
        const host = parsed.hostname || "localhost";
        const port = parsed.port || (type === "postgresql" ? "5432" : "3306");
        const user = decodeURIComponent(parsed.username || "");
        const password = decodeURIComponent(parsed.password || "");

        // Database name is the pathname without leading slash
        const database = decodeURIComponent(parsed.pathname.replace(/^\//, "") || "");

        // Parse SSL parameters from query string
        const sslmode = parsed.searchParams.get("sslmode") || "";
        const ssl = sslmode !== "" && sslmode !== "disable";

        return {
            type,
            host,
            port,
            user,
            password,
            database,
            ssl,
            sslmode,
        };
    } catch (error) {
        // Invalid URL format
        return null;
    }
}

/**
 * Build a connection URL from components
 */
export function buildConnectionUrl(params: {
    type: string;
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
    sslmode?: string;
}): string {
    const protocol = params.type === "mysql" ? "mysql" : "postgres";
    const auth = params.password
        ? `${encodeURIComponent(params.user)}:${encodeURIComponent(params.password)}`
        : encodeURIComponent(params.user);

    let url = `${protocol}://${auth}@${params.host}:${params.port}/${encodeURIComponent(params.database)}`;

    if (params.sslmode && params.sslmode !== "disable") {
        url += `?sslmode=${params.sslmode}`;
    }

    return url;
}
