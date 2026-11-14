import type { EndpointRecord } from "@/lib/types/endpoints";

export interface TargetTreeNode {
  id: string;
  segment: string;
  fullPath: string;
  children: TargetTreeNode[];
  endpoints: EndpointRecord[];
}

interface MutableTreeNode extends TargetTreeNode {
  childMap: Map<string, MutableTreeNode>;
}

function pathSegments(rawUrl: string): string[] {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return rawUrl
      .split("?")[0]
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}

export function buildTargetTree(endpoints: EndpointRecord[]): TargetTreeNode[] {
  const rootMap = new Map<string, MutableTreeNode>();

  for (const endpoint of endpoints) {
    const segments = pathSegments(endpoint.resolvedUrl);
    if (segments.length === 0) {
      continue;
    }
    let levelMap = rootMap;
    let parentPath = "";
    for (const seg of segments) {
      const fullPath = parentPath ? `${parentPath}/${seg}` : seg;
      let node = levelMap.get(seg);
      if (!node) {
        node = {
          id: fullPath,
          segment: seg,
          fullPath,
          children: [],
          endpoints: [],
          childMap: new Map()
        };
        levelMap.set(seg, node);
      }
      parentPath = fullPath;
      levelMap = node.childMap;
      if (fullPath === segments.join("/")) {
        node.endpoints.push(endpoint);
      }
    }
  }

  const toImmutable = (node: MutableTreeNode): TargetTreeNode => ({
    id: node.id,
    segment: node.segment,
    fullPath: node.fullPath,
    endpoints: [...node.endpoints].sort((a, b) => a.resolvedUrl.localeCompare(b.resolvedUrl)),
    children: Array.from(node.childMap.values())
      .map(toImmutable)
      .sort((a, b) => a.segment.localeCompare(b.segment))
  });

  return Array.from(rootMap.values()).map(toImmutable).sort((a, b) => a.segment.localeCompare(b.segment));
}
