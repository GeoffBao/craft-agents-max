import * as React from 'react'
import { useAtom } from 'jotai'
import ReactMarkdown from 'react-markdown'
import { kbJourneyDocsAtom } from '@/atoms/knowledge'
import type { VaultDocument } from '@craft-agent/knowledge-base'

export function JourneyTimeline() {
  const [docs, setDocs] = useAtom(kbJourneyDocsAtom)
  const [selected, setSelected] = React.useState<VaultDocument | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    window.electronAPI.knowledgeListDocs('Journey')
      .then(d => setDocs([...d].sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [setDocs])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
  }

  if (selected) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 flex-shrink-0">
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="text-sm font-semibold">{selected.title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{selected.body}</ReactMarkdown>
        </div>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No Journey entries yet. Start a session and insights will be recorded here.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex-shrink-0">
        <h2 className="text-sm font-semibold">Journey</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{docs.length} daily entries</p>
      </div>
      <ul className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/30">
        {docs.map(doc => (
          <li key={doc.id}>
            <button
              onClick={() => setSelected(doc)}
              className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors group"
            >
              <div className="text-sm font-medium group-hover:text-foreground">{doc.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.bodyText.slice(0, 120)}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
