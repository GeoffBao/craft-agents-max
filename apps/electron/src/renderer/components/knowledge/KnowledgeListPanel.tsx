import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  Search, X, ChevronRight, ChevronDown,
  FileText, Clock, Folder,
} from 'lucide-react'
import type { KnowledgeView } from '../../../shared/types'
import {
  kbStatusAtom,
  kbSearchQueryAtom,
  kbSearchResultsAtom,
  kbSearchLoadingAtom,
  kbAllDocsAtom,
  kbRecentPathsAtom,
  kbVaultRootAtom,
} from '@/atoms/knowledge'
import type { KBStatus } from '@/atoms/knowledge'
import type { VaultDocument, RagChunk } from '@craft-agent/knowledge-base'

interface Props {
  currentView: KnowledgeView
  onViewChange: (view: KnowledgeView) => void
  onArticleSelect: (relativePath: string) => void
}

// ─── constants ───────────────────────────────────────────────────────────────

const MAX_SUBSECTION_ITEMS = 30

const SECTION_ORDER = ['Wiki', 'Notes', 'Journey', 'Projects', 'Raw']
const SECTION_DOT: Record<string, string> = {
  Wiki:     'bg-blue-500',
  Notes:    'bg-green-500',
  Journey:  'bg-amber-500',
  Projects: 'bg-pink-500',
  Raw:      'bg-purple-500',
}
const SECTION_LABEL_COLOR: Record<string, string> = {
  Wiki:     'text-blue-500',
  Notes:    'text-green-500',
  Journey:  'text-amber-500',
  Projects: 'text-pink-500',
  Raw:      'text-purple-500',
}

// ─── types ───────────────────────────────────────────────────────────────────

type SectionData = {
  docs: VaultDocument[]
  subsections: Map<string, VaultDocument[]>
}

// ─── main component ───────────────────────────────────────────────────────────

export function KnowledgeListPanel({ currentView, onViewChange, onArticleSelect }: Props) {
  const [kbStatus, setKbStatus] = useAtom(kbStatusAtom)
  const [query, setQuery] = useAtom(kbSearchQueryAtom)
  const [results, setResults] = useAtom(kbSearchResultsAtom)
  const setLoading = useSetAtom(kbSearchLoadingAtom)
  const [allDocs, setAllDocs] = useAtom(kbAllDocsAtom)
  const [recentPaths, setRecentPaths] = useAtom(kbRecentPathsAtom)
  const setVaultRoot = useSetAtom(kbVaultRootAtom)
  // subsection "show more" state: key = "Section/sub", value = expanded
  const [showMoreSubs, setShowMoreSubs] = React.useState<Set<string>>(new Set())

  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set(['Wiki']))
  const [expandedSubsections, setExpandedSubsections] = React.useState<Set<string>>(new Set())
  const [sectionFilter, setSectionFilter] = React.useState<string | null>(null)

  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // ── section tree ─────────────────────────────────────────────────────────

  const sectionTree = React.useMemo((): Map<string, SectionData> => {
    const tree = new Map<string, SectionData>()
    for (const doc of allDocs) {
      const parts = doc.relativePath.split('/')
      const section = parts[0]
      if (!section) continue
      if (!tree.has(section)) tree.set(section, { docs: [], subsections: new Map() })
      const node = tree.get(section)!
      node.docs.push(doc)
      if (parts.length > 2) {
        const sub = parts[1]
        if (!node.subsections.has(sub)) node.subsections.set(sub, [])
        node.subsections.get(sub)!.push(doc)
      }
    }
    for (const node of tree.values()) {
      node.docs.sort((a, b) => a.title.localeCompare(b.title))
      for (const docs of node.subsections.values()) {
        docs.sort((a, b) => a.title.localeCompare(b.title))
      }
    }
    return tree
  }, [allDocs])

  // ── search grouping ────────────────────────────────────────────────────────

  const groupedResults = React.useMemo((): Map<string, RagChunk[]> => {
    const groups = new Map<string, RagChunk[]>()
    const filtered = sectionFilter
      ? results.filter(r => r.relativePath.startsWith(sectionFilter + '/'))
      : results
    for (const r of filtered) {
      const section = r.relativePath.split('/')[0]
      if (!groups.has(section)) groups.set(section, [])
      groups.get(section)!.push(r)
    }
    return groups
  }, [results, sectionFilter])

  const resultSections = React.useMemo(() => {
    const s = new Set<string>()
    for (const r of results) s.add(r.relativePath.split('/')[0])
    return [...s]
  }, [results])

  // ── recent docs ────────────────────────────────────────────────────────────

  const recentDocs = React.useMemo(
    () =>
      recentPaths
        .map(p => allDocs.find(d => d.relativePath === p))
        .filter(Boolean) as VaultDocument[],
    [recentPaths, allDocs],
  )

  // ── effects ───────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (kbStatus.status === 'ready' && allDocs.length === 0) {
      window.electronAPI.knowledgeListDocs()
        .then(docs => setAllDocs(docs))
        .catch(() => {})
      window.electronAPI.knowledgeGetConfig()
        .then(cfg => { if (cfg?.vaultPath) setVaultRoot(cfg.vaultPath) })
        .catch(() => {})
    }
  }, [kbStatus.status, allDocs.length, setAllDocs, setVaultRoot])

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

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleQueryChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setSectionFilter(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await window.electronAPI.knowledgeSearch(q, 40)
        setResults(res)
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [setQuery, setResults, setLoading])

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setSectionFilter(null)
    searchInputRef.current?.focus()
  }

  const handleArticleSelect = React.useCallback((relativePath: string) => {
    setRecentPaths(prev => [relativePath, ...prev.filter(p => p !== relativePath)].slice(0, 8))
    onArticleSelect(relativePath)
    if (currentView !== 'wiki') onViewChange('wiki')
  }, [setRecentPaths, onArticleSelect, currentView, onViewChange])

  const toggleSection = (section: string) =>
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section); else next.add(section)
      return next
    })

  const toggleSubsection = (key: string) =>
    setExpandedSubsections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  const toggleShowMore = (key: string) =>
    setShowMoreSubs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  const isSearching = query.trim().length > 0

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Status dot (engine health, compact) ── */}
      <div className="flex items-center justify-end px-3 pt-1.5 pb-0 flex-shrink-0">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            kbStatus.status === 'ready'   ? 'bg-green-500' :
            kbStatus.status === 'loading' ? 'bg-amber-500 animate-pulse' :
            kbStatus.status === 'error'   ? 'bg-red-500' : 'bg-muted-foreground/40'
          }`}
          title={`${kbStatus.documentCount} docs · ${kbStatus.status}`}
        />
      </div>

      {/* ── Search ── */}
      <div className="px-2 pt-2 pb-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Search knowledge base…"
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-muted/50 rounded-lg border border-border/40 focus:outline-none focus:ring-1 focus:ring-ring/60 placeholder:text-muted-foreground/50 transition-shadow"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Init progress ── */}
      {kbStatus.status === 'loading' && (
        <div className="px-3 pb-1.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${kbStatus.progress?.percent ?? 0}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {kbStatus.progress?.percent ?? 0}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {kbStatus.progress?.message ?? 'Initializing…'}
          </p>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-2">
        {isSearching ? (
          <SearchResultsPane
            query={query}
            groupedResults={groupedResults}
            resultSections={resultSections}
            sectionFilter={sectionFilter}
            onSectionFilter={setSectionFilter}
            onArticleSelect={handleArticleSelect}
          />
        ) : (
          <BrowsePane
            sectionTree={sectionTree}
            expandedSections={expandedSections}
            expandedSubsections={expandedSubsections}
            showMoreSubs={showMoreSubs}
            recentDocs={recentDocs}
            onToggleSection={toggleSection}
            onToggleSubsection={toggleSubsection}
            onToggleShowMore={toggleShowMore}
            onArticleSelect={handleArticleSelect}
          />
        )}
      </div>
    </div>
  )
}

// ─── BrowsePane ───────────────────────────────────────────────────────────────

interface BrowsePaneProps {
  sectionTree: Map<string, SectionData>
  expandedSections: Set<string>
  expandedSubsections: Set<string>
  showMoreSubs: Set<string>
  recentDocs: VaultDocument[]
  onToggleSection: (s: string) => void
  onToggleSubsection: (key: string) => void
  onToggleShowMore: (key: string) => void
  onArticleSelect: (path: string) => void
}

function BrowsePane({
  sectionTree, expandedSections, expandedSubsections, showMoreSubs,
  recentDocs, onToggleSection, onToggleSubsection, onToggleShowMore, onArticleSelect,
}: BrowsePaneProps) {
  // Sections in preferred order, then any extras
  const orderedSections = [
    ...SECTION_ORDER.filter(s => sectionTree.has(s)),
    ...[...sectionTree.keys()].filter(s => !SECTION_ORDER.includes(s)).sort(),
  ]

  return (
    <div className="pt-1">
      {/* Recent */}
      {recentDocs.length > 0 && (
        <div className="mb-1">
          <div className="px-3 py-1 flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Recent
            </span>
          </div>
          {recentDocs.map(doc => (
            <DocRow key={doc.id} doc={doc} onSelect={onArticleSelect} compact />
          ))}
          <div className="my-1.5 mx-3 border-t border-border/30" />
        </div>
      )}

      {/* Section tree */}
      <div className="px-3 py-1 flex items-center gap-1.5">
        <Folder className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Browse
        </span>
      </div>

      {orderedSections.map(section => {
        const node = sectionTree.get(section)!
        const isExpanded = expandedSections.has(section)
        const dot = SECTION_DOT[section] ?? 'bg-muted-foreground'
        const labelColor = SECTION_LABEL_COLOR[section] ?? 'text-foreground'
        const hasSubsections = node.subsections.size > 0
        const rootDocs = node.docs.filter(
          d => d.relativePath.split('/').length === 2,
        )

        return (
          <div key={section}>
            {/* Section header */}
            <button
              onClick={() => onToggleSection(section)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent/40 transition-colors group"
            >
              {isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <span className={`text-sm font-medium flex-1 text-left ${labelColor}`}>
                {section}
              </span>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                {node.docs.length}
              </span>
            </button>

            {/* Section content */}
            {isExpanded && (
              <div className="pl-4">
                {/* Subsections */}
                {hasSubsections && [...node.subsections.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([sub, subDocs]) => {
                    const subKey = `${section}/${sub}`
                    const subExpanded = expandedSubsections.has(subKey)
                    return (
                      <div key={subKey}>
                        <button
                          onClick={() => onToggleSubsection(subKey)}
                          className="w-full flex items-center gap-2 px-3 py-1 hover:bg-accent/30 transition-colors"
                        >
                          {subExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />}
                          <Folder className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground flex-1 text-left">{sub}</span>
                          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                            {subDocs.length}
                          </span>
                        </button>
                        {subExpanded && (() => {
                          const showAll = showMoreSubs.has(subKey)
                          const visible = showAll ? subDocs : subDocs.slice(0, MAX_SUBSECTION_ITEMS)
                          const remaining = subDocs.length - MAX_SUBSECTION_ITEMS
                          return (
                            <>
                              {visible.map(doc => (
                                <div key={doc.id} className="pl-4">
                                  <DocRow doc={doc} onSelect={onArticleSelect} compact />
                                </div>
                              ))}
                              {!showAll && remaining > 0 && (
                                <button
                                  onClick={() => onToggleShowMore(subKey)}
                                  className="w-full text-left pl-10 pr-3 py-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                >
                                  Show {remaining} more…
                                </button>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    )
                  })}

                {/* Root-level docs (depth 2: Section/File.md) */}
                {rootDocs.map(doc => (
                  <DocRow key={doc.id} doc={doc} onSelect={onArticleSelect} compact />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── SearchResultsPane ────────────────────────────────────────────────────────

interface SearchResultsPaneProps {
  query: string
  groupedResults: Map<string, RagChunk[]>
  resultSections: string[]
  sectionFilter: string | null
  onSectionFilter: (s: string | null) => void
  onArticleSelect: (path: string) => void
}

function SearchResultsPane({
  query, groupedResults, resultSections,
  sectionFilter, onSectionFilter, onArticleSelect,
}: SearchResultsPaneProps) {
  const totalCount = [...groupedResults.values()].reduce((n, g) => n + g.length, 0)

  return (
    <div>
      {/* Section filter chips */}
      {resultSections.length > 1 && (
        <div className="px-2 pt-2 pb-1 flex gap-1 flex-wrap flex-shrink-0">
          <FilterChip
            label="All"
            count={[...groupedResults.values()].reduce((n, g) => n + g.length, 0)}
            active={!sectionFilter}
            onClick={() => onSectionFilter(null)}
          />
          {resultSections.map(s => (
            <FilterChip
              key={s}
              label={s}
              count={groupedResults.get(s)?.length ?? 0}
              active={sectionFilter === s}
              dot={SECTION_DOT[s]}
              onClick={() => onSectionFilter(sectionFilter === s ? null : s)}
            />
          ))}
        </div>
      )}

      {totalCount === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          No results for "{query}"
        </div>
      ) : (
        [...groupedResults.entries()]
          .sort(([a], [b]) => {
            const ai = SECTION_ORDER.indexOf(a)
            const bi = SECTION_ORDER.indexOf(b)
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          })
          .map(([section, chunks]) => (
            <div key={section}>
              {/* Section label */}
              <div className="px-3 pt-3 pb-1 flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${SECTION_DOT[section] ?? 'bg-muted-foreground'}`} />
                <span className={`text-xs font-semibold ${SECTION_LABEL_COLOR[section] ?? 'text-foreground'}`}>
                  {section}
                </span>
                <span className="text-[10px] text-muted-foreground/60">· {chunks.length}</span>
              </div>

              {/* Result rows */}
              {chunks.map((chunk, i) => (
                <button
                  key={i}
                  onClick={() => onArticleSelect(chunk.relativePath)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate group-hover:text-foreground">
                        {chunk.title}
                      </div>
                      {chunk.excerpt && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {chunk.excerpt.slice(0, 120)}
                        </div>
                      )}
                      {chunk.score !== undefined && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-0.5 flex-1 max-w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60"
                              style={{ width: `${Math.round(Math.min(chunk.score, 1) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                            {Math.round(Math.min(chunk.score, 1) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))
      )}
    </div>
  )
}

// ─── shared sub-components ────────────────────────────────────────────────────

function DocRow({
  doc, onSelect, compact = false,
}: { doc: VaultDocument; onSelect: (path: string) => void; compact?: boolean }) {
  return (
    <button
      onClick={() => onSelect(doc.relativePath)}
      className={`w-full text-left px-3 hover:bg-accent/40 transition-colors group flex items-center gap-2 ${
        compact ? 'py-1' : 'py-1.5'
      }`}
    >
      <FileText className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-xs truncate text-muted-foreground group-hover:text-foreground transition-colors">
        {doc.title}
      </span>
    </button>
  )
}

function FilterChip({
  label, count, active, dot, onClick,
}: { label: string; count: number; active: boolean; dot?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/50 text-muted-foreground border-border/40 hover:bg-accent hover:text-foreground'
      }`}
    >
      {dot && <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
      <span className={`tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
    </button>
  )
}
