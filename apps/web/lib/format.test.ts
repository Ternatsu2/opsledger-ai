import { describe, expect, it } from "vitest";

import {
  actorLabel,
  documentProgress,
  eventLabel,
  fileTypeLabel,
  findingText,
  issueLabel,
  money,
  plainMessageDraft,
  sentenceCase,
  shortHash,
  stageLabel,
} from "./format";

describe("format helpers", () => {
  it("formats workflow labels", () => {
    expect(sentenceCase("READY_FOR_HUMAN_REVIEW")).toBe("Ready for human review");
    expect(stageLabel("MANUAL_INVESTIGATION")).toBe("Needs a closer look");
    expect(issueLabel("LEGAL_NAME_MISMATCH")).toBe("Business name does not match");
  });

  it("formats Caribbean currency", () => {
    expect(money("85000", "XCD")).toContain("85,000");
  });

  it("shortens evidence hashes without hiding both ends", () => {
    expect(shortHash("12345678-example-abcdef")).toBe("12345678…abcdef");
  });

  it("turns system records into operator language", () => {
    expect(actorLabel("agent")).toBe("OpsLedger");
    expect(eventLabel("AGENT_RECOMMENDATION_SAVED", "technical summary")).toBe(
      "Review summary prepared",
    );
    expect(
      findingText(
        "FINANCIAL_EVIDENCE_STALE",
        "Revenue evidence is 286 days old; the demo policy allows 180 days.",
      ),
    ).toBe("The revenue record is 286 days old. Add a newer one.");
  });

  it("counts documents separately from application fields", () => {
    expect(documentProgress([
      { code: "legal_business_name", complete: true },
      { code: "REGISTRATION_EVIDENCE", complete: true },
      { code: "REVENUE_STATEMENT", complete: true },
      { code: "BANK_STATEMENT", complete: true },
      { code: "OWNERSHIP_DECLARATION", complete: false },
    ])).toEqual({ received: 3, required: 4 });
  });

  it("uses readable file types", () => {
    expect(fileTypeLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
      .toBe("Spreadsheet");
    expect(fileTypeLabel("text/csv")).toBe("CSV file");
  });

  it("removes implementation language from prepared messages", () => {
    expect(plainMessageDraft(
      "We reviewed the financing-readiness package. Please provide the Ownership Declaration and updated revenue evidence. The demo policy allows evidence up to 180 days old.",
    )).toBe(
      "We reviewed the application. Please provide the ownership form and updated revenue record. Revenue records should be no more than 180 days old.",
    );
  });
});
