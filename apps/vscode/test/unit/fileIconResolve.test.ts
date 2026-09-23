import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUNDLED_ICONS } from "../../src/extension/composer/mentions/bundledIcons.js";
import { iconMimeType, iconSources, pickIconId } from "../../src/extension/composer/mentions/fileIconResolve.js";

const ASSETS_ICONS = fileURLToPath(new URL("../../assets/icons", import.meta.url));

describe("pickIconId", () => {
  const theme = {
    iconDefinitions: { a: { iconPath: "a.svg" } },
    file: "file",
    folder: "folder",
    fileExtensions: { ts: "a" },
    fileNames: { "dockerfile": "a" },
    folderNames: { src: "a" },
    light: { file: "file", folderNames: { docs: "a" } },
  };

  it("prefers exact names over extensions, and extensions over the generic file", () => {
    expect(pickIconId(theme, "Dockerfile", false, false)).toBe("a");
    expect(pickIconId(theme, "app.ts", false, false)).toBe("a");
    expect(pickIconId(theme, "app.unknownext", false, false)).toBe("file");
  });

  it("treats a leading-dot name as a name, not an extension", () => {
    expect(pickIconId({ ...theme, fileNames: {} }, ".gitignore", false, false)).toBe("file");
  });

  it("honours the light overlay only when asked for light", () => {
    expect(pickIconId(theme, "docs", true, true)).toBe("a");
    expect(pickIconId(theme, "docs", true, false)).toBe("folder");
    expect(pickIconId(theme, "anyfile", false, true)).toBe("file");
  });

  it("resolves folders through folder names, then the generic folder", () => {
    expect(pickIconId(theme, "src", true, false)).toBe("a");
    expect(pickIconId(theme, "random", true, false)).toBe("folder");
  });
});

describe("iconSources", () => {
  const bundled = {
    iconDefinitions: { file: { iconPath: "file.svg" } },
    file: "file",
  };

  it("offers the active theme first, then the bundled subset", () => {
    const theme = { iconDefinitions: { file: { iconPath: "./generic.svg" } }, file: "file" };
    expect(iconSources({ fileName: "x", isDirectory: false, light: false, theme, bundled })).toEqual([
      { root: "theme", rel: "./generic.svg" },
      { root: "bundled", rel: "file.svg" },
    ]);
  });

  it("skips font-based themes — their glyphs cannot be drawn as an image", () => {
    const setiLike = { iconDefinitions: { file: { fontCharacter: "\\E900" } }, file: "file" };
    expect(iconSources({ fileName: "x", isDirectory: false, light: false, theme: setiLike, bundled })).toEqual([
      { root: "bundled", rel: "file.svg" },
    ]);
  });

  it("falls back to the bundle when no theme is configured", () => {
    expect(iconSources({ fileName: "x", isDirectory: false, light: false, theme: null, bundled })).toEqual([
      { root: "bundled", rel: "file.svg" },
    ]);
    expect(iconSources({ fileName: "x", isDirectory: false, light: false, theme: undefined, bundled: {} })).toEqual([]);
  });
});

describe("iconMimeType", () => {
  it("covers the formats icon themes ship", () => {
    expect(iconMimeType("a.svg")).toBe("image/svg+xml");
    expect(iconMimeType("a.PNG")).toBe("image/png");
    expect(iconMimeType("a.jpeg")).toBe("image/jpeg");
    expect(iconMimeType("a.woff")).toBeNull();
  });
});

describe("bundled icon subset", () => {
  it("resolves the common attachments to artwork that actually ships", () => {
    const check = (lookup: string | undefined): void => {
      expect(lookup, "map entry").toBeTruthy();
      const def = BUNDLED_ICONS.iconDefinitions?.[lookup!];
      expect(def?.iconPath, `definition for ${lookup}`).toBeTruthy();
      expect(existsSync(join(ASSETS_ICONS, def!.iconPath!)), `file ${def!.iconPath}`).toBe(true);
    };

    for (const ext of ["sh", "py", "log", "json", "md"]) check(BUNDLED_ICONS.fileExtensions?.[ext]);
    for (const name of ["dockerfile", ".gitignore"]) check(BUNDLED_ICONS.fileNames?.[name]);
    check(BUNDLED_ICONS.file);
    check(BUNDLED_ICONS.folder);
  });

  it("carries the MIT notice next to the artwork", () => {
    expect(existsSync(join(ASSETS_ICONS, "NOTICE.md"))).toBe(true);
    expect(existsSync(join(ASSETS_ICONS, "LICENSE.material-icon-theme.txt"))).toBe(true);
  });
});
