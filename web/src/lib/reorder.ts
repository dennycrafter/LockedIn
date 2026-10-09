// Drag reorder math (SPEC 8.2). The UI moves an id from one index to another;
// these helpers produce the new order and the position values to persist.
// The reorder API writes position = index for every id in the list, so a
// reloaded page renders exactly the order the user dragged into.

/** Move the id at `from` to `to`, shifting the others. Out-of-range is a no-op. */
export function applyReorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move one element (by identity) to a new index in its list. */
export function moveItem<T>(items: T[], item: T, to: number): T[] {
  const from = items.indexOf(item);
  return applyReorder(items, from, to);
}

/**
 * The persistence payload for an ordered id list: position = list index.
 * Send every id of the scope (not just the moved one) so the whole list is
 * reindexed and survives a reload deterministically.
 */
export function positionsForIds(orderedIds: string[]): Array<{ id: string; position: number }> {
  return orderedIds.map((id, position) => ({ id, position }));
}
