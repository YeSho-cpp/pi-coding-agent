import { describe, expect, it } from "vitest";

import { displayBashLabel } from "../../src/webview/features/conversation/bashLabel";

describe("displayBashLabel", () => {
  it("strips a leading cd prefix", () => {
    expect(displayBashLabel("cd /a/b && pnpm test")).toBe("pnpm test");
    expect(displayBashLabel('cd "/a b/c" && ls -la')).toBe("ls -la");
    expect(displayBashLabel("cd '/a b' &&git status")).toBe("git status");
  });

  it("keeps commands without a cd prefix or with only cd", () => {
    expect(displayBashLabel("pnpm lint")).toBe("pnpm lint");
    expect(displayBashLabel("ls && cd /a")).toBe("ls && cd /a");
    expect(displayBashLabel("cd /a")).toBe("cd /a");
  });

  it("only strips once", () => {
    expect(displayBashLabel("cd /a && cd b && ls")).toBe("cd b && ls");
  });
});
