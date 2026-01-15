/**
 * Bridge Types - Main Entry Point
 * 
 * This module re-exports all types for convenient importing.
 * 
 * Usage:
 *   import { DBType, MySQLConfig, PGConfig, CacheEntry } from '../types';
 */

// Re-export all types
export * from './cache';
export * from './common';
export * from './mysql';
export * from './postgres';

// ----------------------------
// Core Bridge Types
// ----------------------------

export enum DBType {
  POSTGRES = "postgres",
  MYSQL = "mysql",
}

export type Rpc = {
  sendResponse: (id: number | string, payload: any) => void;
  sendError: (
    id: number | string,
    err: { code?: string; message: string }
  ) => void;
  sendNotification?: (method: string, params?: any) => void;
};

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  ssl?: boolean;
  database: string;
}

export interface QueryParams {
  sessionId: string;
  dbId: string;
  sql: string;
  batchSize?: number;
}
