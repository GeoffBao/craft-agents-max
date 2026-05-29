import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import path from 'path';

export interface WatcherCallbacks {
  onAdd: (filePath: string) => void
  onChange: (filePath: string) => void
  onUnlink: (filePath: string) => void
}

export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly debounceMs: number

  constructor(debounceMs = 500) {
    this.debounceMs = debounceMs;
  }

  start(vaultRoot: string, sections: string[], callbacks: WatcherCallbacks): void {
    const paths = sections.length > 0
      ? sections.map((s) => path.join(vaultRoot, s))
      : [vaultRoot];

    this.watcher = chokidar.watch(paths, {
      ignored: [/(^|[/\\])\../, /node_modules/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher
      .on('add', (p) => {
        if (p.endsWith('.md')) this.debounce(p, () => callbacks.onAdd(p));
      })
      .on('change', (p) => {
        if (p.endsWith('.md')) this.debounce(p, () => callbacks.onChange(p));
      })
      .on('unlink', (p) => {
        if (p.endsWith('.md')) {
          this.clearDebounce(p);
          callbacks.onUnlink(p);
        }
      });
  }

  stop(): void {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    this.watcher?.close().catch(() => {});
    this.watcher = null;
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, this.debounceMs);
    this.debounceTimers.set(key, t);
  }

  private clearDebounce(key: string): void {
    const t = this.debounceTimers.get(key);
    if (t) {
      clearTimeout(t);
      this.debounceTimers.delete(key);
    }
  }
}
