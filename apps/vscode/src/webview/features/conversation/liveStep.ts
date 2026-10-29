import type { AgentTurnView } from "$shared/model/conversationModel";

/** A step must stay in progress this long before its row opens, so instant tools never flash open. */
export const LIVE_EXPAND_DELAY_MS = 350;

/**
 * The one step of a running turn the reader should see unfolded: the last tool still running,
 * or the reasoning the model is still writing. Everything else stays a one-line row.
 *
 * A reasoning item carries its whole message's status, which stays `streaming` after the
 * thinking ends and the model moves on to a tool call or the reply. Reasoning therefore only
 * counts while no later step exists; tools carry their own status and may run side by side.
 */
export function liveStepId(turn: Pick<AgentTurnView, "status" | "items">): string | null {
  if (turn.status !== "running") return null;

  let laterStep = false;
  for (let index = turn.items.length - 1; index >= 0; index -= 1) {
    const item = turn.items[index]!;
    if (item.type === "tool") {
      if (item.tool.status === "running") return item.id;
      laterStep = true;
    } else if (item.type === "reasoning") {
      if (item.status === "streaming" && !laterStep) return item.id;
      laterStep = true;
    } else if (item.type === "response") {
      laterStep = true;
    }
  }
  return null;
}
