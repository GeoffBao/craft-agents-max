import * as React from 'react'
import { useAtom } from 'jotai'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { VaultDocument } from '@craft-agent/knowledge-base'
import { kbSelectedArticleAtom } from '@/atoms/knowledge'

interface Props {
  relativePath: string | null
  onNavigate: (relativePath: string) => void
  onBack: () => void
}

export function WikiBrowser({ relativePath, onNavigate, onBack }: Props) {
  const [article, setArticle] = useAtom(kbSelectedArticleAtom)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!relativePath) { setArticle(null); return }
    setLoading(true)
    window.electronAPI.knowledgeGetArticle(relativePath)
      .then(a => setArticle(a))
      .catch(() => setArticle(null))
      .finally(() => setLoading(false))
  }, [relativePath, setArticle])

  if (!relativePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select an article from the search results
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
  }

  if (!article) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Article not found: {relativePath}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{article.title}</h1>
          <div className="text-xs text-muted-foreground truncate">{article.relativePath}</div>
        </div>
        {article.tags.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {article.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs px-1.5 py-0.5 bg-muted rounded-sm text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <WikiMarkdown body={article.body} onWikilink={onNavigate} />

        {/* Backlinks */}
        {article.backlinks.length > 0 && (
          <div className="mt-8 pt-4 border-t border-border/40">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Backlinks ({article.backlinks.length})
            </h3>
            <ul className="space-y-0.5">
              {article.backlinks.slice(0, 15).map((path, i) => (
                <li key={i}>
                  <button
                    onClick={() => onNavigate(path)}
                    className="text-xs text-blue-500 hover:underline truncate max-w-full block text-left"
                  >
                    {path}
                  </button>
                </li>
              ))}
              {article.backlinks.length > 15 && (
                <li className="text-xs text-muted-foreground">+{article.backlinks.length - 15} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// Renders markdown, converting [[wikilinks]] to clickable buttons
function WikiMarkdown({ body, onWikilink }: { body: string; onWikilink: (path: string) => void }) {
  // Pre-process: replace [[Title|Display]] / [[Title]] with a custom placeholder
  const processed = body.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_m, target, display) => {
    const label = display ?? target
    return `[${label}](wikilink:${encodeURIComponent(target.trim())})`
  })

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('wikilink:')) {
              const target = decodeURIComponent(href.slice(9))
              return (
                <button
                  onClick={() => onWikilink(target)}
                  className="text-blue-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit"
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
                className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
              >
                {children}
                <ExternalLink className="h-3 w-3 inline" />
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
