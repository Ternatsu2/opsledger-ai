import { describe, expect, it } from "vitest";

import { money, sentenceCase, shortHash } from "./format";

describe("format helpers", () => {
  it("formats workflow labels", () => {
    expect(sentenceCase("READY_FOR_HUMAN_REVIEW")).toBe("Ready for human review");
  });

  it("formats Caribbean currency", () => {
    expect(money("85000", "XCD")).toContain("85,000");
  });

  it("shortens evidence hashes without hiding both ends", () => {
    expect(shortHash("12345678-example-abcdef")).toBe("12345678…abcdef");
  });
});
