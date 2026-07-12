import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface StoredTeambitionBinding {
  provider: 'teambition'
  taskId: string
  sessionId: string
  sourceSlug: string
  state: 'claimed'
  claimedAt: string
}

const INTEGRATION_DIR = ['integrations', 'teambition'] as const
const BINDINGS_FILE = 'bindings.json'

function bindingsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ...INTEGRATION_DIR)
}

function bindingsPath(workspaceRoot: string): string {
  return join(bindingsDir(workspaceRoot), BINDINGS_FILE)
}

async function writeBindingsFile(filePath: string, bindings: StoredTeambitionBinding[]): Promise<void> {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, JSON.stringify(bindings, null, 2), 'utf-8')
  await rename(tempPath, filePath)
}

export async function loadBindings(workspaceRoot: string): Promise<StoredTeambitionBinding[]> {
  try {
    const raw = await readFile(bindingsPath(workspaceRoot), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredTeambitionBinding[]) : []
  } catch {
    return []
  }
}

export async function claimBinding(
  workspaceRoot: string,
  binding: StoredTeambitionBinding,
): Promise<StoredTeambitionBinding> {
  const dir = bindingsDir(workspaceRoot)
  const filePath = bindingsPath(workspaceRoot)
  await mkdir(dir, { recursive: true })

  const bindings = await loadBindings(workspaceRoot)
  const existing = bindings.find((entry) => entry.taskId === binding.taskId)
  if (existing) {
    return existing
  }

  bindings.push(binding)
  await writeBindingsFile(filePath, bindings)
  return binding
}

export async function findBindingByTaskId(
  workspaceRoot: string,
  taskId: string,
): Promise<StoredTeambitionBinding | undefined> {
  const bindings = await loadBindings(workspaceRoot)
  return bindings.find((binding) => binding.taskId === taskId)
}
