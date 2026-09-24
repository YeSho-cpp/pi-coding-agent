import { describe, expect, it } from "vitest";

import { classForScopes } from "../../src/extension/highlight/scopeClassMap.js";

describe("classForScopes", () => {
  it("colours identifiers the way the editor does — members and calls included", () => {
    expect(classForScopes(["source.c", "variable.other.member.c"])).toBe("hljs-property");
    expect(classForScopes(["source.c", "variable.other.readwrite.c"])).toBe("hljs-variable");
    expect(classForScopes(["source.c", "meta.function-call.c"])).toBe("hljs-function");
    expect(classForScopes(["source.c", "entity.name.function.c"])).toBe("hljs-function");
  });

  it("routes types through the type colour, not the keyword-blue hljs-type", () => {
    // Our stylesheet paints .hljs-type with --md-syn-keyword and hljs-built_in with
    // --md-syn-type, so name similarity would put types on the wrong colour.
    expect(classForScopes(["source.c", "storage.type"])).toBe("hljs-built_in");
    expect(classForScopes(["source.c", "entity.name.type.c"])).toBe("hljs-built_in");
  });

  it("lets the deepest scope win over its wrapper", () => {
    expect(
      classForScopes(["source.c", "meta.function.c", "punctuation.section.function.begin.c"]),
    ).toBe("hljs-punctuation");
    expect(classForScopes(["source.c", "meta.function-call.c", "variable.other.member.c"])).toBe("hljs-property");
  });

  it("keeps operators, strings, comments and numbers on their colours", () => {
    expect(classForScopes(["source.c", "keyword.operator.assignment.c"])).toBe("hljs-operator");
    expect(classForScopes(["source.c", "string.quoted.double.c"])).toBe("hljs-string");
    expect(classForScopes(["source.c", "comment.line.double-slash.c"])).toBe("hljs-comment");
    expect(classForScopes(["source.c", "constant.numeric.decimal.c"])).toBe("hljs-number");
    expect(classForScopes(["c", "support.function.builtin.c"])).toBe("hljs-built_in");
    expect(classForScopes(["source.c", "entity.name.tag.c"])).toBe("hljs-tag");
    expect(classForScopes(["source.c", "entity.other.attribute-name.c"])).toBe("hljs-attr");
  });

  it("leaves generic wrappers and unknown scopes on the block foreground", () => {
    expect(classForScopes(["source.c", "meta.block.c"])).toBeNull();
    expect(classForScopes(["source.c", "entity.name.constant.other"])).toBeNull();
    expect(classForScopes(["source.c"])).toBeNull();
    expect(classForScopes([])).toBeNull();
  });
});
