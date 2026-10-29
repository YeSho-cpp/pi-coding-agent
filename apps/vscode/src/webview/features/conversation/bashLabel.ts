const CD_PREFIX = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*/;

/** Drops the `cd <dir> &&` the model prepends to every command; the session cwd is already known. */
export function displayBashLabel(label: string): string {
  const stripped = label.replace(CD_PREFIX, "");
  return stripped.length > 0 ? stripped : label;
}
