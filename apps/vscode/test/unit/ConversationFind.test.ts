// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import ConversationFind from "../../src/webview/features/conversation/find/ConversationFind.svelte";

/**
 * The widget owns its own collect/paint effects, so this drives it the way a reader would:
 * type, step through matches with Enter, close. The message tree is a plain container prop.
 */

function messages(): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = `
    <p>user buffer vs recv buffer</p>
    <p>send buffer staging</p>
    <div hidden><p>buffer hidden from view</p></div>
  `;
  document.body.append(container);
  return container;
}

let container: HTMLElement;

function openFind(onclose = vi.fn()) {
  const result = render(ConversationFind, { props: { container, revision: 0, onclose } });
  return { ...result, onclose };
}

afterEach(() => {
  cleanup();
  container?.remove();
});

describe("ConversationFind", () => {
  it("starts focused and empty, with nothing to count", () => {
    container = messages();
    openFind();

    const input = screen.getByPlaceholderText<HTMLInputElement>("Find in conversation");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("");
    expect(screen.queryByText(/\/\s*\d/)).toBeNull();
  });

  it("counts only matches the reader can see", async () => {
    container = messages();
    openFind();

    await fireEvent.input(screen.getByPlaceholderText<HTMLInputElement>("Find in conversation"), { target: { value: "buffer" } });

    // Three painted matches; the one inside the hidden subtree is not counted.
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("says so instead of counting when nothing matches", async () => {
    container = messages();
    openFind();

    await fireEvent.input(screen.getByPlaceholderText<HTMLInputElement>("Find in conversation"), { target: { value: "zzz" } });

    expect(screen.getByText("No results")).toBeTruthy();
  });

  it("steps forward with Enter, backward with Shift+Enter, and wraps", async () => {
    container = messages();
    openFind();
    const input = screen.getByPlaceholderText<HTMLInputElement>("Find in conversation");

    await fireEvent.input(input, { target: { value: "buffer" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2 / 3")).toBeTruthy();

    await fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("1 / 3")).toBeTruthy();

    // Wrap backwards from the first match to the last.
    await fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("disables stepping when there is nothing to step through", async () => {
    container = messages();
    openFind();

    await fireEvent.input(screen.getByPlaceholderText<HTMLInputElement>("Find in conversation"), { target: { value: "zzz" } });

    const previous = screen.getByLabelText<HTMLButtonElement>("Previous match");
    const next = screen.getByLabelText<HTMLButtonElement>("Next match");
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it("closes through the callback the conversation gave it", async () => {
    container = messages();
    const { onclose } = openFind();

    await fireEvent.click(screen.getByLabelText("Close find"));

    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("recounts when the conversation changes underneath it", async () => {
    container = messages();
    const { rerender } = openFind();
    const input = screen.getByPlaceholderText<HTMLInputElement>("Find in conversation");
    await fireEvent.input(input, { target: { value: "buffer" } });
    expect(screen.getByText("1 / 3")).toBeTruthy();

    container.querySelector("p")!.textContent = "no match here anymore";
    await rerender({ props: { container, revision: 1, onclose: vi.fn() } });

    // Only the second paragraph still matches; the hidden subtree never counted.
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
});
