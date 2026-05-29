import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { BookOpen, Map, BookMarked, Layout, Search, Network, Settings } from 'lucide-react'
import type { KnowledgeView } from '../../../shared/types'
import {
  kbStatusAtom,
  kbSearchQueryAtom,
  kbSearchResultsAtom,
  kbSearchLoadingAtom,
} from '@/atoms/knowledge'
import type { KBStatus } from '@/atoms/knowledge'

interface Props {
  currentView: KnowledgeView
  onViewChange: (view: KnowledgeView) => void
  onArticleSelect: (relativePath: string) => void
}

const VIEW_ICONS: Record<KnowledgeView, React.ComponentType<{ className?: string }>> = {
  wiki: BookOpen,
  journey: BookMarked,
  graph: Network,
  books: Map,
  canvas: Layout,
  settings: Settings,
}

export function KnowledgeListPanel({ currentView, onViewChange, onArticleSelect }: Props) {
  const { t } = useTranslation()
  const [kbStatus, setKbStatus] = useAtom(kbStatusAtom)
  const [query, setQuery] = useAtom(kbSearchQueryAtom)
  const [results, setResults] = useAtom(kbSearchResultsAtom)
  const setLoading = useSetAtom(kbSearchLoadingAtom)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const views: KnowledgeView[] = ['wiki', 'journey', 'graph', 'books', 'canvas', 'settings']

  const handleQueryChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await window.electronAPI.knowledgeSearch(q, 20)
        setResults(res)
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [setQuery, setResults, setLoading])

  React.useEffect(() => {
    const poll = () => {
      window.electronAPI.knowledgeGetStatus()
        .then((s): KBStatus => ({
          status: s.status,
          documentCount: s.documentCount,
          error: s.error,
          progress: s.progress,
        }))
        .then(setKbStatus)
        .catch(() => {})
    }
    poll()
    const intervalMs = kbStatus.status === 'ready' ? 30_000 : 2_000
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [kbStatus.status, setKbStatus])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* View tabs */}
      <div className="flex border-b border-border/50 px-1 pt-1 gap-0.5 flex-shrink-0">
        {views.map(v => {
          const Icon = VIEW_ICONS[v]
          const isActive = v === currentView
          return (
            <button
              key={v}
              onClick={() => { onViewChange(v); setQuery(''); setResults([]) }}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t(`knowledge.${v}`)}</span>
            </button>
          )
        })}
      </div>

      {/* Search box (wiki only) */}
      {currentView === 'wiki' && (
        <div className="px-2 pt-2 pb-1 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={handleQueryChange}
              placeholder={t('knowledge.searchPlaceholder')}
              className="w-full pl-7 pr-2 py-1.5 text-sm bg-muted/50 rounded-md border border-border/40 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      )}

      {/* Status / progress */}
      {(kbStatus.status !== 'ready' || (kbStatus.progress && kbStatus.progress.percent < 100 && kbStatus.progress.phase !== 'ready')) && (
        <div className="px-3 py-2 text-xs text-muted-foreground flex-shrink-0 space-y-1">
          <div>{kbStatus.progress?.message ?? t('knowledge.engineNotReady')} ({kbStatus.status})</div>
          {kbStatus.progress && kbStatus.progress.percent > 0 && kbStatus.progress.percent < 100 && (
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${kbStatus.progress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {query && results.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{t('knowledge.noResults')}</div>
        ) : query ? (
          <ul className="py-1">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => onArticleSelect(r.relativePath)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors group"
                >
                  <div className="text-sm font-medium truncate group-hover:text-foreground">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{r.excerpt.slice(0, 80)}</div>
                  <div className="text-xs text-muted-foreground/60 truncate mt-0.5">{r.relativePath}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {kbStatus.documentCount > 0
              ? `${kbStatus.documentCount} documents indexed`
              : t('knowledge.engineNotReady')}
          </div>
        )}
      </div>
    </div>
  )
}
