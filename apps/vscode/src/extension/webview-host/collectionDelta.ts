import type { CollectionDelta, TurnPatch } from "../../shared/bridge/hostToWebview.js";
import type { AgentTurnView } from "../../shared/model/conversationModel.js";

interface Identified {
  id: string;
}

export function collectionDelta<T extends Identified>(
  previousOrder: readonly string[],
  previousRefs: ReadonlyMap<string, T>,
  current: readonly T[],
): CollectionDelta<T> {
  const currentOrder = current.map((item) => item.id);
  const isAppendOnly = previousOrder.length <= currentOrder.length
    && previousOrder.every((id, index) => currentOrder[index] === id);
  if (!isAppendOnly) return { mode: "replace", items: [...current] };

  const items: T[] = [];
  const turnPatches: TurnPatch[] = [];
  for (const item of current) {
    const previous = previousRefs.get(item.id);
    if (previous === item) continue;
    const patch = previous === undefined ? null : turnPatch(previous, item);
    if (patch === UNCHANGED) continue;
    if (patch) turnPatches.push(patch);
    else items.push(item);
  }
  return turnPatches.length > 0 ? { mode: "upsert", items, turnPatches } : { mode: "upsert", items };
}

/** A rebuilt turn object that says nothing new: it needs no message and keeps the Webview's object. */
const UNCHANGED = Symbol("unchanged turn");

function isTurn(value: Identified): value is Identified & AgentTurnView {
  return (value as { type?: unknown }).type === "turn" && Array.isArray((value as { items?: unknown }).items);
}

/**
 * Describes how a turn the Webview holds became `current`. A field that was removed cannot be
 * expressed as a patch, so those turns travel whole.
 */
function turnPatch(previous: Identified, current: Identified): TurnPatch | typeof UNCHANGED | null {
  if (!isTurn(previous) || !isTurn(current)) return null;

  const fields: TurnPatch["fields"] = {};
  if (previous.status !== current.status) fields.status = current.status;
  if (previous.startedAt !== current.startedAt) fields.startedAt = current.startedAt;
  if (previous.endedAt !== current.endedAt) {
    if (current.endedAt === undefined) return null;
    fields.endedAt = current.endedAt;
  }
  if (previous.userMessage !== current.userMessage) {
    if (current.userMessage === undefined) return null;
    fields.userMessage = current.userMessage;
  }

  const held = new Map(previous.items.map((item) => [item.id, item]));
  const items = current.items.filter((item) => held.get(item.id) !== item);
  const previousIds = previous.items.map((item) => item.id);
  const currentIds = current.items.map((item) => item.id);
  const keepsHeldOrder = previousIds.length <= currentIds.length
    && previousIds.every((id, index) => currentIds[index] === id);
  if (Object.keys(fields).length === 0 && items.length === 0 && keepsHeldOrder && previousIds.length === currentIds.length) {
    return UNCHANGED;
  }
  return { id: current.id, fields, items, ...(keepsHeldOrder ? {} : { order: currentIds }) };
}
