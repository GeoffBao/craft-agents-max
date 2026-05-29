import * as React from 'react'
import '@excalidraw/excalidraw/index.css'
import type { KnowledgeVaultFileEntry } from '../../../shared/types'

interface CanvasNode {
  id: string
  type?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  file?: string
  color?: string
}

interface CanvasEdge {
  id?: string
  fromNode: string
  toNode: string
  label?: string
}

interface ObsidianCanvas {
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
}

function ObsidianCanvasView({ raw }: { raw: string }) {
  let data: ObsidianCanvas
  try {
    data = JSON.parse(raw) as ObsidianCanvas
  } catch {
    return <p className="text-sm text-muted-foreground p-4">Invalid canvas JSON</p>
  }

  const nodes = data.nodes ?? []
  const edges = data.edges ?? []
  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">Empty canvas</p>
  }

  const xs = nodes.map(n => n.x ?? 0)
  const ys = nodes.map(n => n.y ?? 0)
  const maxX = Math.max(...nodes.map(n => (n.x ?? 0) + (n.width ?? 200)), ...xs)
  const maxY = Math.max(...nodes.map(n => (n.y ?? 0) + (n.height ?? 100)), ...ys)
  const pad = 40
  const viewW = maxX + pad
  const viewH = maxY + pad

  const nodeById = new Map(nodes.map(n => [n.id, n]))

  return (
    <div className="overflow-auto h-full w-full bg-muted/20 p-4">
      <svg
        width={viewW}
        height={viewH}
        className="text-foreground"
        style={{ minWidth: viewW, minHeight: viewH }}
      >
        {edges.map((edge, i) => {
          const from = nodeById.get(edge.fromNode)
          const to = nodeById.get(edge.toNode)
          if (!from || !to) return null
          const x1 = (from.x ?? 0) + (from.width ?? 200) / 2
          const y1 = (from.y ?? 0) + (from.height ?? 100) / 2
          const x2 = (to.x ?? 0) + (to.width ?? 200) / 2
          const y2 = (to.y ?? 0) + (to.height ?? 100) / 2
          return (
            <line
              key={edge.id ?? i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={0.25}
              markerEnd="url(#arrow)"
            />
          )
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" fillOpacity={0.35} />
          </marker>
        </defs>
        {nodes.map(node => (
          <foreignObject
            key={node.id}
            x={node.x ?? 0}
            y={node.y ?? 0}
            width={node.width ?? 220}
            height={node.height ?? 120}
          >
            <div className="h-full w-full rounded-md border border-border/60 bg-card p-2 text-xs overflow-hidden shadow-sm">
              <pre className="whitespace-pre-wrap font-sans leading-snug line-clamp-[8]">
                {node.text ?? node.file ?? node.type ?? node.id}
              </pre>
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  )
}

function ExcalidrawPanel({ raw }: { raw: string }) {
  const [ExcalidrawComp, setExcalidrawComp] = React.useState<React.ComponentType<{
    initialData: { elements: unknown[]; appState?: Record<string, unknown> }
    viewModeEnabled: boolean
    UIOptions: Record<string, unknown>
  }> | null>(null)

  React.useEffect(() => {
    void import('@excalidraw/excalidraw').then(mod => {
      setExcalidrawComp(() => mod.Excalidraw as typeof ExcalidrawComp)
    })
  }, [])

  const initialData = React.useMemo(() => {
    try {
      const parsed = JSON.parse(raw) as {
        elements?: unknown[]
        appState?: Record<string, unknown>
      }
      return {
        elements: parsed.elements ?? [],
        appState: { ...(parsed.appState ?? {}), viewModeEnabled: true },
      }
    } catch {
      return { elements: [], appState: { viewModeEnabled: true } }
    }
  }, [raw])

  if (!ExcalidrawComp) {
    return <div className="p-4 text-sm text-muted-foreground">Loading Excalidraw...</div>
  }

  return (
    <div className="h-full w-full">
      <ExcalidrawComp
        initialData={initialData}
        viewModeEnabled
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  )
}

export function CanvasViewer() {
  const [files, setFiles] = React.useState<KnowledgeVaultFileEntry[]>([])
  const [selected, setSelected] = React.useState<KnowledgeVaultFileEntry | null>(null)
  const [content, setContent] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    window.electronAPI.knowledgeListVaultFiles()
      .then(list => {
        setFiles(list)
        if (list.length > 0) setSelected(list[0]!)
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!selected) {
      setContent(null)
      return
    }
    window.electronAPI.knowledgeReadVaultFile(selected.relativePath)
      .then(setContent)
      .catch(() => setContent(null))
  }, [selected])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading diagrams...
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm px-6 text-center">
        No canvas or Excalidraw files in Diagrams/ or Excalidraw/.
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-52 flex-shrink-0 border-r border-border/50 overflow-y-auto">
        <ul className="py-1">
          {files.map(file => (
            <li key={file.relativePath}>
              <button
                type="button"
                onClick={() => setSelected(file)}
                className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${
                  selected?.relativePath === file.relativePath
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="block truncate">{file.name}</span>
                <span className="text-[10px] opacity-60">{file.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {!content ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file
          </div>
        ) : selected?.kind === 'excalidraw' ? (
          <ExcalidrawPanel raw={content} />
        ) : (
          <ObsidianCanvasView raw={content} />
        )}
      </div>
    </div>
  )
}
