export interface BashFileRead {
  path: string;
  startLine?: number;
  endLine?: number;
}

type Token = { kind: "word"; value: string } | { kind: "separator" };

const SHELL_SYNTAX = "|&<>()`$*?[]{}~!#";

/**
 * Recognizes a shell command that does nothing but print part of one file
 * (`sed -n '900,935p' f`, `cat f`, `head -n 20 f`, `tail -n 5 f`), optionally after a
 * `cd <dir>` line. Anything with pipes, redirects, globs, expansions or a second command is
 * left alone: a wrong guess would label a card with a file it never read.
 */
export function parseBashFileRead(command: string): BashFileRead | null {
  const tokens = tokenize(command);
  if (!tokens) return null;

  const statements: string[][] = [[]];
  for (const token of tokens) {
    if (token.kind === "separator") statements.push([]);
    else statements[statements.length - 1]!.push(token.value);
  }
  const present = statements.filter((words) => words.length > 0);

  let directory: string | undefined;
  let reader: string[] | undefined;
  if (present.length === 1) {
    reader = present[0];
  } else if (present.length === 2 && present[0]!.length === 2 && present[0]![0] === "cd" && !present[0]![1]!.startsWith("-")) {
    directory = present[0]![1];
    reader = present[1];
  }
  if (!reader) return null;

  const read = parseReader(reader);
  if (!read) return null;
  return { ...read, path: directory ? joinPath(directory, read.path) : read.path };
}

function parseReader(words: string[]): BashFileRead | null {
  const [program, ...args] = words;
  switch (program) {
    case "cat":
      return args.length === 1 ? fileOnly(args[0]) : null;
    case "sed":
      return parseSed(args);
    case "head":
      return parseHeadTail(args, true);
    case "tail":
      return parseHeadTail(args, false);
    default:
      return null;
  }
}

function parseSed(args: string[]): BashFileRead | null {
  if (args.length !== 3 || args[0] !== "-n") return null;
  const script = /^(\d+)(?:,(\d+|\$))?p$/.exec(args[1]!);
  const file = operand(args[2]);
  if (!script || !file) return null;
  const startLine = Number(script[1]);
  const end = script[2];
  const endLine = end === undefined ? startLine : end === "$" ? undefined : Number(end);
  if (startLine < 1 || (endLine !== undefined && endLine < startLine)) return null;
  return { path: file, startLine, ...(endLine === undefined ? {} : { endLine }) };
}

function parseHeadTail(args: string[], isHead: boolean): BashFileRead | null {
  let count: number | undefined;
  let rest = args;
  const first = args[0];
  if (first !== undefined && first.startsWith("-")) {
    const separate = first === "-n" ? args[1] : undefined;
    const attached = /^-n?(\d+)$/.exec(first)?.[1];
    const value = separate ?? attached;
    if (value === undefined || !/^\d+$/.test(value)) return null;
    count = Number(value);
    rest = args.slice(separate === undefined ? 1 : 2);
  }
  if (rest.length !== 1) return null;
  const file = operand(rest[0]);
  if (!file) return null;
  if (!isHead) return { path: file };
  return { path: file, startLine: 1, endLine: count ?? 10 };
}

function fileOnly(value: string | undefined): BashFileRead | null {
  const file = operand(value);
  return file ? { path: file } : null;
}

function operand(value: string | undefined): string | null {
  return value && !value.startsWith("-") ? value : null;
}

function joinPath(directory: string, file: string): string {
  if (file.startsWith("/")) return file;
  return `${directory.replace(/\/+$/, "")}/${file.replace(/^(?:\.\/)+/, "")}`;
}

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let word = "";
  let inWord = false;
  const flush = (): void => {
    if (!inWord) return;
    tokens.push({ kind: "word", value: word });
    word = "";
    inWord = false;
  };

  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === "'") {
      const end = source.indexOf("'", index + 1);
      if (end < 0) return null;
      word += source.slice(index + 1, end);
      inWord = true;
      index = end + 1;
    } else if (char === '"') {
      const end = source.indexOf('"', index + 1);
      if (end < 0) return null;
      const inner = source.slice(index + 1, end);
      if (/[$`\\]/.test(inner)) return null;
      word += inner;
      inWord = true;
      index = end + 1;
    } else if (char === "\\") {
      const next = source.charAt(index + 1);
      if (next === "" || next === "\n" || next === "\r") return null;
      word += next;
      inWord = true;
      index += 2;
    } else if (char === " " || char === "\t" || char === "\r") {
      flush();
      index += 1;
    } else if (char === "\n" || char === ";") {
      flush();
      tokens.push({ kind: "separator" });
      index += 1;
    } else if (char === "&" && source.charAt(index + 1) === "&") {
      flush();
      tokens.push({ kind: "separator" });
      index += 2;
    } else if (SHELL_SYNTAX.includes(char)) {
      return null;
    } else {
      word += char;
      inWord = true;
      index += 1;
    }
  }
  flush();
  return tokens;
}
