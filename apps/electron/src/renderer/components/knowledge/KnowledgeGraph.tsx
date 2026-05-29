import * as React from 'react'
import * as d3 from 'd3'
import type { VaultDocument } from '@craft-agent/knowledge-base'

interface Props {
  onArticleNavigate: (relativePath: string) => void
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  section: string
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

const SECTION_COLORS: Record<string, string> = {
  Wiki: '#3b82f6',
  Notes: '#22c55e',
  Raw: '#a855f7',
  Journey: '#f59e0b',
  Projects: '#ec4899',
  other: '#94a3b8',
}

const MAX_NODES = 250

function fileStem(relativePath: string): string {
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.md$/i, '').toLowerCase()
}

export function KnowledgeGraph({ onArticleNavigate }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const titleToPathRef = React.useRef<Map<string, string>>(new Map())

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const docs = await window.electronAPI.knowledgeListDocs()
        if (cancelled) return

        const titleToPath = new Map<string, string>()
        for (const doc of docs) {
          titleToPath.set(doc.title.toLowerCase(), doc.relativePath)
          titleToPath.set(fileStem(doc.relativePath), doc.relativePath)
        }
        titleToPathRef.current = titleToPath

        const limited = docs.slice(0, MAX_NODES) as VaultDocument[]
        const nodeIds = new Set(limited.map(d => d.id))
        const nodes: GraphNode[] = limited.map(d => ({
          id: d.id,
          title: d.title,
          section: d.section,
        }))

        const linkSet = new Set<string>()
        const links: GraphLink[] = []
        for (const doc of limited) {
          for (const targetTitle of doc.wikilinks) {
            const targetPath = titleToPath.get(targetTitle.toLowerCase())
            if (!targetPath || !nodeIds.has(targetPath)) continue
            const key = [doc.id, targetPath].sort().join('→')
            if (linkSet.has(key)) continue
            linkSet.add(key)
            links.push({ source: doc.id, target: targetPath })
          }
        }

        container.replaceChildren()
        const width = container.clientWidth || 800
        const height = container.clientHeight || 600

        const svg = d3.select(container)
          .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('class', 'bg-background')

        const g = svg.append('g')

        const zoom = d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 4])
          .on('zoom', (event) => {
            g.attr('transform', event.transform)
          })
        svg.call(zoom)

        const link = g.append('g')
          .attr('stroke', 'currentColor')
          .attr('stroke-opacity', 0.25)
          .selectAll('line')
          .data(links)
          .join('line')
          .attr('stroke-width', 1)

        const node = g.append('g')
          .selectAll('circle')
          .data(nodes)
          .join('circle')
          .attr('r', 6)
          .attr('fill', d => SECTION_COLORS[d.section] ?? SECTION_COLORS.other)
          .attr('stroke', 'hsl(var(--background))')
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')
          .on('click', (_event, d) => {
            onArticleNavigate(d.id)
          })

        const label = g.append('g')
          .selectAll('text')
          .data(nodes)
          .join('text')
          .text(d => d.title.length > 24 ? `${d.title.slice(0, 22)}…` : d.title)
          .attr('font-size', 10)
          .attr('fill', 'currentColor')
          .attr('opacity', 0.7)
          .attr('dx', 10)
          .attr('dy', 3)
          .style('pointer-events', 'none')

        simulation = d3.forceSimulation(nodes)
          .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(72))
          .force('charge', d3.forceManyBody().strength(-140))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force('collision', d3.forceCollide(14))

        simulation.on('tick', () => {
          link
            .attr('x1', d => (d.source as GraphNode).x ?? 0)
            .attr('y1', d => (d.source as GraphNode).y ?? 0)
            .attr('x2', d => (d.target as GraphNode).x ?? 0)
            .attr('y2', d => (d.target as GraphNode).y ?? 0)
          node
            .attr('cx', d => d.x ?? 0)
            .attr('cy', d => d.y ?? 0)
          label
            .attr('x', d => d.x ?? 0)
            .attr('y', d => d.y ?? 0)
        })

        node.append('title').text(d => d.title)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load graph')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      simulation?.stop()
      container.replaceChildren()
    }
  }, [onArticleNavigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading graph...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm px-4 text-center">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-border/50 text-xs text-muted-foreground flex-shrink-0">
        Drag to pan · scroll to zoom · click node to open article
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 text-foreground" />
    </div>
  )
}
