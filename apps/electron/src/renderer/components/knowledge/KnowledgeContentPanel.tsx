import type { KnowledgeView } from '../../../shared/types'
import { WikiBrowser } from './WikiBrowser'
import { JourneyTimeline } from './JourneyTimeline'
import { KnowledgeGraph } from './KnowledgeGraph'
import { BooksShelf } from './BooksShelf'
import { CanvasViewer } from './CanvasViewer'
import { KnowledgeSettings } from './KnowledgeSettings'

interface Props {
  view: KnowledgeView
  selectedArticlePath: string | null
  onArticleNavigate: (relativePath: string) => void
  onArticleBack: () => void
}

export function KnowledgeContentPanel({ view, selectedArticlePath, onArticleNavigate, onArticleBack }: Props) {
  switch (view) {
    case 'wiki':
      return (
        <WikiBrowser
          relativePath={selectedArticlePath}
          onNavigate={onArticleNavigate}
          onBack={onArticleBack}
        />
      )
    case 'journey':
      return <JourneyTimeline />
    case 'graph':
      return <KnowledgeGraph onArticleNavigate={onArticleNavigate} />
    case 'books':
      return <BooksShelf />
    case 'canvas':
      return <CanvasViewer />
    case 'settings':
      return <KnowledgeSettings />
  }
}
