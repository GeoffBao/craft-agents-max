import fs from 'fs';
import os from 'os';
import path from 'path';
import type { KBConfig, VaultSection } from './types.ts';
import { DEFAULT_KB_CONFIG } from './types.ts';

export interface StoredKBConfig {
  vaultPath?: string
  cachePath?: string
  autoInject?: boolean
  injectThreshold?: number
  injectMaxChunks?: number
  writeBackMode?: KBConfig['writeBackMode']
  embeddingModel?: string
  indexedSections?: VaultSection[]
  enableEmbeddings?: boolean
}

export function getDefaultCachePath(): string {
  return path.join(os.homedir(), '.craft-agent/knowledge-base');
}

export function getConfigFilePath(cachePath: string): string {
  return path.join(cachePath, 'config.json');
}

export function loadStoredConfig(cachePath: string): StoredKBConfig {
  const filePath = getConfigFilePath(cachePath);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as StoredKBConfig;
  } catch {
    return {};
  }
}

export function saveStoredConfig(cachePath: string, patch: StoredKBConfig): StoredKBConfig {
  fs.mkdirSync(cachePath, { recursive: true });
  const existing = loadStoredConfig(cachePath);
  const merged = { ...existing, ...patch };
  fs.writeFileSync(getConfigFilePath(cachePath), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function resolveKBConfig(
  overrides: Partial<KBConfig> & Pick<KBConfig, 'vaultPath' | 'cachePath'>,
): KBConfig {
  const stored = loadStoredConfig(overrides.cachePath);
  return {
    vaultPath: stored.vaultPath ?? overrides.vaultPath,
    cachePath: overrides.cachePath,
    autoInject: stored.autoInject ?? overrides.autoInject ?? DEFAULT_KB_CONFIG.autoInject,
    injectThreshold: stored.injectThreshold ?? overrides.injectThreshold ?? DEFAULT_KB_CONFIG.injectThreshold,
    injectMaxChunks: stored.injectMaxChunks ?? overrides.injectMaxChunks ?? DEFAULT_KB_CONFIG.injectMaxChunks,
    writeBackMode: stored.writeBackMode ?? overrides.writeBackMode ?? DEFAULT_KB_CONFIG.writeBackMode,
    embeddingModel: stored.embeddingModel ?? overrides.embeddingModel ?? DEFAULT_KB_CONFIG.embeddingModel,
    indexedSections: stored.indexedSections ?? overrides.indexedSections ?? DEFAULT_KB_CONFIG.indexedSections,
    enableEmbeddings: stored.enableEmbeddings ?? overrides.enableEmbeddings ?? DEFAULT_KB_CONFIG.enableEmbeddings,
  };
}
