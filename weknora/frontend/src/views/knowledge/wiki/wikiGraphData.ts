import type { WikiGraphData } from '../../../api/wiki'

export function normalizeWikiGraphData(graph: WikiGraphData): WikiGraphData {
  return {
    ...graph,
    nodes: graph.nodes ?? [],
    edges: graph.edges ?? [],
  }
}
