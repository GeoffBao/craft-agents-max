import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { ArrowLeft, ExternalLink, Hash, FileText, BookOpen, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { VaultDocument } from '@craft-agent/knowledge-base'
import { kbSelectedArticleAtom, kbAllDocsAtom, kbRecentPathsAtom, kbStatusAtom } from '@/atoms/knowledge'

interface Props {
  relativePath: string | null
  onNavigate: (relativePath: string) => void
  onBack: () => void
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TocEntry {
  level: number
  text: string
  id: string
}

const SECTION_DOT: Record<string, string> = {
  Wiki:     'bg-blue-500',
  Notes:    'bg-green-500',
  Journey:  'bg-amber-500',
  Projects: 'bg-pink-500',
  Raw:      'bg-purple-500',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToc(body: string): TocEntry[] {
  const lines = body.split('\n')
  const entries: TocEntry[] = []
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)/)
    if (!m) continue
    const text = m[2].replace(/\*\*|__|\*|_|`/g, '').trim()
    entries.push({
      level: m[1].length,
      text,
      id: text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
    })
  }
  return entries
}

// ── Main component ────────────────────────────────────────────────────────────

export function WikiBrowser({ relativePath, onNavigate, onBack }: Props) {
  const [article, setArticle] = useAtom(kbSelectedArticleAtom)
  const [loading, setLoading] = React.useState(false)
  const [activeTocId, setActiveTocId] = React.useState<string>('')
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!relativePath) { setArticle(null); return }
    setLoading(true)
    setActiveTocId('')
    window.electronAPI.knowledgeGetArticle(relativePath)
      .then(a => setArticle(a))
      .catch(() => setArticle(null))
      .finally(() => setLoading(false))
  }, [relativePath, setArticle])

  // Track active heading for TOC highlight
  React.useEffect(() => {
    if (!contentRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          setActiveTocId(visible[0].target.id)
        }
      },
      { threshold: 0.5, rootMargin: '-60px 0px -40% 0px' },
    )
    const headings = contentRef.current.querySelectorAll('h1,h2,h3,h4')
    headings.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [article])

  // No article selected → show Knowledge Home
  if (!relativePath) {
    return <KnowledgeHome onNavigate={onNavigate} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <FileText className="h-8 w-8 opacity-30" />
        <p className="text-sm">Article not found</p>
        <p className="text-xs opacity-60">{relativePath}</p>
        <button onClick={onBack} className="text-xs underline hover:no-underline">
          Go back
        </button>
      </div>
    )
  }

  const toc = extractToc(article.body)
  const breadcrumb = article.relativePath.split('/').slice(0, -1)

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main article area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 flex-shrink-0 bg-background/80 backdrop-blur-sm">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            {/* Breadcrumb */}
            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 mb-0.5">
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/40 text-[10px]">/</span>}
                    <span className={`text-[10px] font-medium ${
                      i === 0 ? (SECTION_DOT[crumb] ? `text-${crumb.toLowerCase()}-500` : 'text-muted-foreground') : 'text-muted-foreground/70'
                    }`}>
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            <h1 className="text-sm font-semibold truncate leading-tight">{article.title}</h1>
          </div>
          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="flex gap-1 flex-shrink-0 ml-2">
              {article.tags.slice(0, 4).map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground border border-border/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Article body */}
        <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
          <WikiMarkdown body={article.body} onWikilink={onNavigate} />

          {/* Backlinks */}
          {article.backlinks.length > 0 && (
            <div className="mt-10 pt-4 border-t border-border/40">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Linked from ({article.backlinks.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {article.backlinks.slice(0, 20).map((path, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate(path)}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                  >
                    {path.split('/').pop()?.replace(/\.md$/i, '') ?? path}
                  </button>
                ))}
                {article.backlinks.length > 20 && (
                  <span className="text-xs text-muted-foreground/50">
                    +{article.backlinks.length - 20} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TOC sidebar ── */}
      {toc.length >= 3 && (
        <div className="w-44 flex-shrink-0 border-l border-border/40 overflow-y-auto py-4 px-2 hidden xl:block">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 mb-2">
            On this page
          </p>
          <nav className="space-y-0.5">
            {toc.map(entry => (
              <button
                key={entry.id}
                onClick={() => {
                  const el = contentRef.current?.querySelector(`#${entry.id}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                style={{ paddingLeft: `${(entry.level - 1) * 8 + 8}px` }}
                className={`w-full text-left py-0.5 pr-2 text-xs rounded transition-colors line-clamp-2 ${
                  activeTocId === entry.id
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground/70 hover:text-foreground'
                }`}
              >
                {entry.text}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}

// ── Knowledge Home (default state) ────────────────────────────────────────────

function KnowledgeHome({ onNavigate }: { onNavigate: (path: string) => void }) {
  const allDocs = useAtomValue(kbAllDocsAtom)
  const recentPaths = useAtomValue(kbRecentPathsAtom)
  const kbStatus = useAtomValue(kbStatusAtom)

  const recentDocs = React.useMemo(
    () =>
      recentPaths
        .map(p => allDocs.find(d => d.relativePath === p))
        .filter(Boolean) as VaultDocument[],
    [recentPaths, allDocs],
  )

  // Section counts
  const sectionStats = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const doc of allDocs) {
      const section = doc.relativePath.split('/')[0]
      counts.set(section, (counts.get(section) ?? 0) + 1)
    }
    return counts
  }, [allDocs])

  const SECTION_META: Record<string, { label: string; dot: string; desc: string }> = {
    Wiki:     { label: 'Wiki',     dot: 'bg-blue-500',   desc: 'Compiled knowledge' },
    Notes:    { label: 'Notes',    dot: 'bg-green-500',  desc: 'Personal notes' },
    Journey:  { label: 'Journey',  dot: 'bg-amber-500',  desc: 'Daily memory' },
    Projects: { label: 'Projects', dot: 'bg-pink-500',   desc: 'Project docs' },
    Raw:      { label: 'Raw',      dot: 'bg-purple-500', desc: 'Unprocessed input' },
  }

  const orderedSections = ['Wiki', 'Notes', 'Journey', 'Projects', 'Raw'].filter(
    s => sectionStats.has(s),
  )

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-muted-foreground/50" />
          <h1 className="text-base font-semibold">Knowledge Base</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          {kbStatus.documentCount > 0
            ? `${kbStatus.documentCount.toLocaleString()} documents indexed`
            : 'Initializing…'}
        </p>
      </div>

      {/* Recent docs */}
      {recentDocs.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
            <h2 className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
              Recent
            </h2>
          </div>
          <div className="space-y-0.5">
            {recentDocs.map(doc => {
              const section = doc.relativePath.split('/')[0]
              const dot = SECTION_DOT[section] ?? 'bg-muted-foreground'
              return (
                <button
                  key={doc.id}
                  onClick={() => onNavigate(doc.relativePath)}
                  className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors group"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  <span className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
                    {doc.title}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Section overview */}
      {orderedSections.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3">
            Sections
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {orderedSections.map(section => {
              const meta = SECTION_META[section]
              const count = sectionStats.get(section) ?? 0
              return (
                <div
                  key={section}
                  className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 hover:bg-accent/40 transition-colors cursor-default"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">{meta.desc}</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-foreground/80">
                    {count.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {kbStatus.status === 'uninitialized' && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50 gap-2">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">Knowledge base not initialized</p>
          <p className="text-xs">Check Settings to configure vault path</p>
        </div>
      )}
    </div>
  )
}

// ── WikiMarkdown ──────────────────────────────────────────────────────────────

function WikiMarkdown({ body, onWikilink }: { body: string; onWikilink: (path: string) => void }) {
  const processed = body.replace(
    /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target, display) => {
      const label = display ?? target
      return `[${label}](wikilink:${encodeURIComponent(target.trim())})`
    },
  )

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:scroll-mt-20
      prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
      prose-p:leading-relaxed prose-p:text-foreground/90
      prose-code:text-xs prose-code:bg-muted/60 prose-code:rounded prose-code:px-1
      prose-pre:bg-muted/60 prose-pre:border prose-pre:border-border/50
      prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground
    ">
      <ReactMarkdown
        components={{
          h1: ({ children, ...props }) => {
            const text = String(children)
            return <h1 id={slugify(text)} {...props}>{children}</h1>
          },
          h2: ({ children, ...props }) => {
            const text = String(children)
            return <h2 id={slugify(text)} {...props}>{children}</h2>
          },
          h3: ({ children, ...props }) => {
            const text = String(children)
            return <h3 id={slugify(text)} {...props}>{children}</h3>
          },
          h4: ({ children, ...props }) => {
            const text = String(children)
            return <h4 id={slugify(text)} {...props}>{children}</h4>
          },
          a: ({ href, children }) => {
            if (href?.startsWith('wikilink:')) {
              const target = decodeURIComponent(href.slice(9))
              return (
                <button
                  onClick={() => onWikilink(target)}
                  className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-[inherit] inline"
                >
                  {children}
                </button>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                {children}
                <ExternalLink className="h-3 w-3 inline flex-shrink-0" />
              </a>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
}
