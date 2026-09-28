declare module 'd3-force-3d' {
  export interface ForceNode3D {
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
  }

  export interface Force3D<Node extends ForceNode3D> {
    (alpha: number): void
    initialize?: (nodes: Node[], ...dimensions: unknown[]) => void
    strength(): number | ((node: Node, index: number, nodes: Node[]) => number)
    strength(value: number | ((node: Node, index: number, nodes: Node[]) => number)): Force3D<Node>
    radius(): number | ((node: Node, index: number, nodes: Node[]) => number)
    radius(value: number | ((node: Node, index: number, nodes: Node[]) => number)): Force3D<Node>
  }

  export function forceRadial<Node extends ForceNode3D>(
    radius: number | ((node: Node, index: number, nodes: Node[]) => number),
    x?: number,
    y?: number,
    z?: number,
  ): Force3D<Node>
}
