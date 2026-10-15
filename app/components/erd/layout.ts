import type ELK from 'elkjs/lib/elk-api'

export interface LayoutRequest {
  nodes: { id: string; width: number; height: number }[]
  edges: { id: string; source: string; target: string }[]
}

let elk: InstanceType<typeof ELK> | null = null

/**
 * Auto-layout with elkjs (layered). `elk-api` runs the algorithm in a Web Worker started from
 * `elk-worker`, so a big schema never blocks the UI.
 */
export async function autoLayout(request: LayoutRequest): Promise<Record<string, { x: number; y: number }>> {
  if (!elk) {
    const [{ default: ELK }, { default: workerUrl }] = await Promise.all([
      import('elkjs/lib/elk-api.js'),
      import('elkjs/lib/elk-worker.min.js?url'),
    ])
    elk = new ELK({ workerUrl })
  }
  const { nodes, edges } = request
  const out = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.spacing.componentComponent': '60',
      'elk.separateConnectedComponents': 'true',
      'elk.aspectRatio': '1.8',
      'elk.layered.thoroughness': nodes.length > 80 ? '2' : '5',
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  })
  const positions: Record<string, { x: number; y: number }> = {}
  for (const child of out.children ?? []) positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  return positions
}
