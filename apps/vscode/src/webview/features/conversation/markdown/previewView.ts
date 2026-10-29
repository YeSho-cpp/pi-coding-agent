import { writable } from "svelte/store";

/**
 * Shared Preview/Source choice for every preview fence (mermaid, html, svg).
 * One knob: flipping it in one block flips the rest, so the transcript reads
 * consistently instead of a mix of previews and sources.
 */
export const previewView = writable<"preview" | "source">("preview");
