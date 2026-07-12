/**
 * Jotai atoms for the Teambition Integration renderer state.
 *
 * These atoms hold sidecar data that sits outside SessionMeta persistence:
 * task bindings, capabilities, and picker visibility. They are populated
 * from the preload RPC layer and joined onto KanbanTask view models at render
 * time without mutating persistent session state.
 */
import { atom } from 'jotai'
import type { RendererTaskSummary, TeambitionCapabilityDto } from '@craft-agent/shared/protocol/dto'

// ---------------------------------------------------------------------------
// Task summaries (fetched from Teambition when the picker opens)
// ---------------------------------------------------------------------------

export const teambitionTasksAtom = atom<RendererTaskSummary[]>([])

export const teambitionTasksLoadingAtom = atom<boolean>(false)

export const teambitionTasksErrorAtom = atom<string | null>(null)

// ---------------------------------------------------------------------------
// Capabilities (fetched once per workspace session)
// ---------------------------------------------------------------------------

export const teambitionCapabilitiesAtom = atom<TeambitionCapabilityDto[]>([])

// ---------------------------------------------------------------------------
// Picker visibility
// ---------------------------------------------------------------------------

export const teambitionPickerOpenAtom = atom<boolean>(false)

// ---------------------------------------------------------------------------
// Binding map: sessionId → taskId lookup for view-model join
// ---------------------------------------------------------------------------

export interface TeambitionBindingEntry {
  taskId: string
  sessionId: string
  kind: string
  projectName?: string
}

export const teambitionBindingMapAtom = atom<Map<string, TeambitionBindingEntry>>(new Map())

// ---------------------------------------------------------------------------
// Derived: taskId → sessionId reverse lookup
// ---------------------------------------------------------------------------

export const teambitionTaskSessionMapAtom = atom<Map<string, string>>(get => {
  const bindings = get(teambitionBindingMapAtom)
  const map = new Map<string, string>()
  for (const [, entry] of bindings) {
    map.set(entry.taskId, entry.sessionId)
  }
  return map
})
