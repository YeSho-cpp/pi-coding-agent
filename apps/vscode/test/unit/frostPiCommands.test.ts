import { describe, expect, it } from "vitest";

import { withFrostUiCommands } from "../../src/webview/features/composer/frostuiCommands.js";

describe("Frost UI composer commands", () => {
  it("advertises built-in commands ahead of same-named Pi resources", () => {
    const commands = withFrostUiCommands([
      { name: "compact", description: "Extension compact", source: "extension" },
      { name: "inspect", description: "Inspect files", source: "prompt" },
    ]);

    expect(commands).toEqual([
      expect.objectContaining({ name: "compact", source: "piAgent" }),
      expect.objectContaining({ name: "editor", source: "piAgent" }),
      expect.objectContaining({ name: "resume", source: "piAgent" }),
      expect.objectContaining({ name: "inspect", source: "prompt" }),
    ]);
  });

  it("omits host-local Resume from Session Tab completion", () => {
    const commands = withFrostUiCommands([
      { name: "resume", description: "Extension resume", source: "extension" },
      { name: "inspect", description: "Inspect files", source: "prompt" },
    ], false);

    expect(commands.map((command) => command.name)).toEqual(["compact", "editor", "inspect"]);
  });
});
