import { format, formatDistanceToNowStrict } from "date-fns";

import type { CaseStage } from "./types";

const stageLabels: Record<CaseStage, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Received",
  INGESTING: "Checking documents",
  EXTRACTION_FAILED: "File needs attention",
  VALIDATING: "Checking details",
  NEEDS_INFORMATION: "More information needed",
  AGENT_REVIEW: "Preparing review",
  READY_FOR_HUMAN_REVIEW: "Ready for review",
  MANUAL_INVESTIGATION: "Needs a closer look",
  APPROVED_FOR_NEXT_STAGE: "Approved for next step",
  CLOSED: "Closed",
};

const issueLabels: Record<string, string> = {
  REQUIRED_DOCUMENT_MISSING: "Missing document",
  REQUIRED_FIELD_MISSING: "Missing application detail",
  FINANCIAL_EVIDENCE_STALE: "Financial record is out of date",
  FINANCIAL_DATE_INVALID: "Financial record has an invalid date",
  LEGAL_NAME_MISMATCH: "Business name does not match",
  REGISTRATION_NUMBER_MISMATCH: "Registration number does not match",
  JURISDICTION_MISMATCH: "Country or territory does not match",
  DUPLICATE_REGISTRATION: "Registration number already in use",
  DUPLICATE_BUSINESS_CONTACT: "Possible duplicate application",
  DUPLICATE_DOCUMENT: "Document already used",
  REVENUE_TOTAL_MISMATCH: "Revenue total does not add up",
  CURRENCY_MISMATCH: "Currency does not match",
  CURRENCY_NOT_SUPPORTED: "Currency is not supported",
  bank_as_of_date: "Statement date",
  bank_currency: "Currency",
  bank_ending_balance: "Ending balance",
  bank_transaction_count: "Transactions",
  jurisdiction: "Country or territory",
  legal_business_name: "Business name",
  owner_name: "Owner name",
  ownership_declared: "Ownership confirmed",
  ownership_signed_on: "Ownership form date",
  registered_on: "Registration date",
  registration_number: "Registration number",
  revenue_as_of_date: "Revenue record date",
  revenue_computed_total: "Total from rows",
  revenue_currency: "Currency",
  revenue_declared_total: "Stated total",
  revenue_row_count: "Revenue entries",
};

const documentLabels: Record<string, string> = {
  REGISTRATION_EVIDENCE: "Business registration",
  REVENUE_STATEMENT: "Revenue records",
  BANK_STATEMENT: "Bank statement",
  OWNERSHIP_DECLARATION: "Ownership form",
};

const requiredDocumentTypes = new Set(Object.keys(documentLabels));

export function money(amount: string | number, currency: string): string {
  return new Intl.NumberFormat("en-AG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function dateTime(value: string): string {
  return format(new Date(value), "d MMM yyyy, HH:mm");
}

export function relativeTime(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function sentenceCase(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function stageLabel(stage: CaseStage): string {
  return stageLabels[stage];
}

export function issueLabel(ruleCode: string): string {
  return issueLabels[ruleCode] ?? sentenceCase(ruleCode);
}

export function findingText(ruleCode: string, message: string): string {
  if (ruleCode === "REQUIRED_DOCUMENT_MISSING") {
    return "Add the missing ownership form.";
  }
  if (ruleCode === "FINANCIAL_EVIDENCE_STALE") {
    const days = message.match(/is (\d+) days old/)?.[1];
    return days
      ? `The revenue record is ${days} days old. Add a newer one.`
      : "Add a newer revenue record.";
  }
  if (ruleCode === "REQUIRED_FIELD_MISSING") {
    const field = message.match(/^(.+?) is required/)?.[1];
    return field ? `Add the missing ${field.toLowerCase()}.` : "Add the missing application detail.";
  }
  if (ruleCode === "FINANCIAL_DATE_INVALID") {
    return "The revenue record is dated after the review date. Check the file date.";
  }
  if (ruleCode === "LEGAL_NAME_MISMATCH") {
    return "A document uses a different business name from the application.";
  }
  if (ruleCode === "REGISTRATION_NUMBER_MISMATCH") {
    return "A document uses a different registration number from the application.";
  }
  if (ruleCode === "JURISDICTION_MISMATCH") {
    return "A document lists a different country or territory from the application.";
  }
  if (ruleCode === "DUPLICATE_REGISTRATION") {
    const reference = message.match(/OPS-\d{4}-\d{4}/)?.[0];
    return reference
      ? `This registration number also appears on ${reference}.`
      : "This registration number appears on another open application.";
  }
  if (ruleCode === "DUPLICATE_BUSINESS_CONTACT") {
    const reference = message.match(/OPS-\d{4}-\d{4}/)?.[0];
    return reference
      ? `The business name and contact also appear on ${reference}.`
      : "The business name and contact appear on another open application.";
  }
  if (ruleCode === "DUPLICATE_DOCUMENT") {
    return "This file was already added to another application.";
  }
  if (ruleCode === "REVENUE_TOTAL_MISMATCH") {
    return "The stated revenue total does not match the rows in the file.";
  }
  if (ruleCode === "CURRENCY_MISMATCH") {
    return "A financial document uses a different currency from the application.";
  }
  if (ruleCode === "CURRENCY_NOT_SUPPORTED") {
    const currency = message.match(/^([A-Z]{3})/)?.[1];
    return currency
      ? `${currency} is not available for this application.`
      : "Choose a supported currency.";
  }
  return message;
}

export function documentLabel(documentType: string): string {
  return documentLabels[documentType] ?? sentenceCase(documentType);
}

export function fileTypeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/csv") return "CSV file";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Spreadsheet";
  return "File";
}

export function documentProgress(
  items: Array<{ code: string; complete: boolean }>,
): { received: number; required: number } {
  const documents = items.filter((item) => requiredDocumentTypes.has(item.code));
  return {
    received: documents.filter((item) => item.complete).length,
    required: documents.length,
  };
}

export function plainMessageDraft(value: string): string {
  return value
    .replaceAll(/financing-readiness package/gi, "application")
    .replaceAll(/synthetic demo documents/gi, "documents")
    .replaceAll(/Ownership Declaration/g, "ownership form")
    .replaceAll(/revenue evidence/gi, "revenue record")
    .replaceAll(
      /([a-z][a-z ]+) is required by the synthetic demo policy/gi,
      "$1 is missing",
    )
    .replaceAll(
      /([a-z][a-z ]+) is required by the document checklist/gi,
      "$1 is missing",
    )
    .replaceAll(
      /the demo policy allows evidence up to (\d+) days old/gi,
      "please send a revenue record dated within the last $1 days",
    )
    .replaceAll(
      /the demo policy allows (\d+) days/gi,
      "please send one dated within the last $1 days",
    )
    .replaceAll(". please", ". Please")
    .replaceAll(/the synthetic demo policy/gi, "the document checklist");
}

export function actorLabel(actorType: string): string {
  return actorType === "user" ? "Reviewer" : "OpsLedger";
}

export function eventLabel(eventType: string, summary: string): string {
  if (eventType === "CASE_CREATED") return "Application created";
  if (eventType === "DOCUMENT_STORED") {
    return summary
      .replace(/^Stored /, "Added ")
      .replace(/ for OPS-\d{4}-\d{4}$/, "");
  }
  if (eventType === "DOCUMENT_EXTRACTED") {
    return summary.replace(/^Extracted /, "Checked ");
  }
  if (eventType === "VALIDATION_COMPLETED") {
    const count = Number(summary.match(/with (\d+) finding/)?.[1] ?? 0);
    return count
      ? `Application checks found ${count} item${count === 1 ? "" : "s"} to review`
      : "Application checks completed";
  }
  if (eventType === "AGENT_RECOMMENDATION_SAVED") return "Review summary prepared";
  if (eventType === "CASE_ASSIGNMENT_CHANGED") return "Reviewer assignment changed";
  if (eventType === "REVIEW_ACTION_RECORDED") return "Reviewer saved a decision";
  if (eventType === "CASE_STAGE_CHANGED") {
    if (summary.includes("Started document extraction")) return "Started checking documents";
    if (summary.includes("Started deterministic validation")) return "Started checking application details";
    if (summary.includes("AGENT_REVIEW")) return "Document checks completed";
    if (summary.includes("NEEDS_INFORMATION")) return "Application needs more information";
    if (summary.includes("MANUAL_INVESTIGATION")) return "Application needs a closer look";
    if (summary.includes("READY_FOR_HUMAN_REVIEW")) return "Application is ready for review";
    return "Application status updated";
  }
  return summary;
}

export function sourceLabel(source: string): string {
  if (source.startsWith("Column ")) return "Spreadsheet";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
