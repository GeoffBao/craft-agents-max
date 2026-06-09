/**
 * SQLite opener for session FTS index — Node (Electron) and Bun runtimes.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export interface IndexStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface IndexDatabase {
  exec(sql: string): void;
  prepare(sql: string): IndexStatement;
  close(): void;
}

function wrapNodeDatabase(db: import('node:sqlite').DatabaseSync): IndexDatabase {
  return {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          stmt.run(...params);
        },
        get(...params: unknown[]) {
          return stmt.get(...params);
        },
        all(...params: unknown[]) {
          return stmt.all(...params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}

function openNodeDatabase(dbPath: string): IndexDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  return wrapNodeDatabase(new DatabaseSync(dbPath));
}

function moduleRequirePath(): string {
  if (typeof __filename !== 'undefined') return __filename;
  return fileURLToPath(import.meta.url);
}

function openBunDatabase(dbPath: string): IndexDatabase {
  const req = createRequire(moduleRequirePath());
  const { Database } = req('bun:sqlite') as { Database: new (path: string) => IndexDatabase };
  return new Database(dbPath);
}

export function openIndexDatabase(dbPath: string): IndexDatabase {
  if (typeof process !== 'undefined' && process.versions?.bun) {
    return openBunDatabase(dbPath);
  }
  return openNodeDatabase(dbPath);
}
