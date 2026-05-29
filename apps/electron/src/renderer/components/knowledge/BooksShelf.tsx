import * as React from 'react'
import type { KnowledgeBookEntry } from '../../../shared/types'

export function BooksShelf() {
  const [books, setBooks] = React.useState<KnowledgeBookEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [sort, setSort] = React.useState<'recent' | 'progress' | 'title'>('recent')

  React.useEffect(() => {
    setLoading(true)
    window.electronAPI.knowledgeListBooks()
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setLoading(false))
  }, [])

  const sorted = React.useMemo(() => {
    const copy = [...books]
    if (sort === 'title') {
      copy.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'progress') {
      copy.sort((a, b) => {
        const pa = parseInt(a.progress ?? '0', 10) || 0
        const pb = parseInt(b.progress ?? '0', 10) || 0
        return pb - pa
      })
    }
    return copy
  }, [books, sort])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading books...
      </div>
    )
  }

  if (books.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm px-6 text-center">
        No books found. Sync WeRead or Readwise notes into Raw/weread or Raw/readwise.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Books</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{books.length} titles</p>
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          className="text-xs bg-muted/50 border border-border/40 rounded-md px-2 py-1"
        >
          <option value="recent">Recent</option>
          <option value="progress">Progress</option>
          <option value="title">Title</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map(book => (
            <article
              key={book.relativePath}
              className="rounded-lg border border-border/50 bg-card overflow-hidden hover:border-border transition-colors"
            >
              <div className="aspect-[2/3] bg-muted/40 flex items-center justify-center overflow-hidden">
                {book.cover ? (
                  <img
                    src={book.cover}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-2xl text-muted-foreground/40">📖</span>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <h3 className="text-xs font-medium line-clamp-2 leading-snug">{book.title}</h3>
                {book.author && (
                  <p className="text-[10px] text-muted-foreground truncate">{book.author}</p>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="capitalize">{book.source}</span>
                  {book.progress && <span>{book.progress}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
