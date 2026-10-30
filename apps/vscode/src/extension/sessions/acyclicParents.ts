export interface ParentLinked {
  readonly id: string;
  readonly parentId: string | null;
}

const ON_PATH = 1;
const RESOLVED = 2;

// Nodes on a cycle, or hanging below one, resolve to null; each node is visited once.
export function acyclicParents(nodesById: ReadonlyMap<string, ParentLinked>): Map<string, string | null> {
  const state = new Map<string, number>();
  const reachesCycle = new Map<string, boolean>();
  const path: string[] = [];

  for (const start of nodesById.keys()) {
    if (state.has(start)) continue;

    path.length = 0;
    let cursor: string | null = start;
    let cyclic = false;
    while (cursor !== null) {
      const known = state.get(cursor);
      if (known === RESOLVED) {
        cyclic = reachesCycle.get(cursor) === true;
        break;
      }
      if (known === ON_PATH) {
        cyclic = true;
        break;
      }
      state.set(cursor, ON_PATH);
      path.push(cursor);
      const parentId: string | null = nodesById.get(cursor)?.parentId ?? null;
      cursor = parentId !== null && nodesById.has(parentId) ? parentId : null;
    }

    for (const id of path) {
      state.set(id, RESOLVED);
      reachesCycle.set(id, cyclic);
    }
  }

  const parentById = new Map<string, string | null>();
  for (const node of nodesById.values()) {
    const { parentId } = node;
    const valid = parentId !== null && nodesById.has(parentId) && reachesCycle.get(node.id) !== true;
    parentById.set(node.id, valid ? parentId : null);
  }
  return parentById;
}
