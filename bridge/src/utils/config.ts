import path from "path";
import os from "os";
import fsSync from "fs";

export const CONFIG_FOLDER =
  process.env.RELWAVE_HOME ||
  path.join(
    os.homedir(),
    process.platform === "win32"
      ? "AppData\\Roaming\\relwave"
      : ".relwave"
  );

export const CONFIG_FILE = path.join(CONFIG_FOLDER, "databases.json");
export const CREDENTIALS_FILE = path.join(CONFIG_FOLDER, ".credentials");
export const AI_SETTINGS_FILE = path.join(CONFIG_FOLDER, "ai-settings.json");


export const PROJECTS_FOLDER = path.join(CONFIG_FOLDER, "projects");
export const PROJECTS_INDEX_FILE = path.join(PROJECTS_FOLDER, "index.json");

export function getConnectionDir(connectionId: string) {
  return path.join(CONFIG_FOLDER, "connections", connectionId);
}

export function getProjectDir(projectId: string) {
  return path.join(PROJECTS_FOLDER, projectId);
}

export function ensureDir(dir: string) {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
}