"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  DownloadSimple,
  File,
  FileText,
  Info,
  MagnifyingGlass,
  NotePencil,
  Play,
  ShieldCheck,
  SpinnerGap,
  UserCircle,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DecisionDialog } from "@/components/decision-dialog";
import { StageBadge } from "@/components/stage-badge";
import { ErrorState, PageLoading } from "@/components/states";
import { apiFetch, assetUrl, idempotencyHeaders } from "@/lib/api";
import {
  actorLabel,
  dateTime,
  documentLabel,
  documentProgress,
  eventLabel,
  fileTypeLabel,
  findingText,
  issueLabel,
  money,
  plainMessageDraft,
  sourceLabel,
  stageLabel,
} from "@/lib/format";
import type { AgentRun, CaseDetail, Finding, SystemStatus } from "@/lib/types";

type WorkspaceTab = "summary" | "documents" | "history";

interface DecisionConfig {
  actionType: string;
  title: string;
  detail: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  findingId?: string;
}

const guidance = {
  READY_FOR_HUMAN_REVIEW: {
    title: "Ready for review",
    text: "All required documents are present. Check the summary, then choose a next step.",
    tone: "ready",
  },
  NEEDS_INFORMATION: {
    title: "More information needed",
    text: "Review the items below and update the message draft before contacting the business.",
    tone: "warning",
  },
  MANUAL_INVESTIGATION: {
    title: "Needs a closer look",
    text: "Some details do not match. Check the original documents before taking action.",
    tone: "danger",
  },
  APPROVED_FOR_NEXT_STAGE: {
    title: "Approved for the next step",
    text: "The reviewer's decision and note are saved with this application.",
    tone: "ready",
  },
} as const;

function latestRun(runs: AgentRun[]): AgentRun | null {
  return [...runs].sort(
    (left, right) => new Date(right.started_at).getTime() - new Date(left.started_at).getTime(),
  )[0] ?? null;
}

export default function CaseWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [caseRecord, setCaseRecord] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [publicWritesLocked, setPublicWritesLocked] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [detail, system] = await Promise.all([
        apiFetch<CaseDetail>(`/cases/${id}`),
        apiFetch<SystemStatus>("/system"),
      ]);
      setCaseRecord(detail);
      setPublicWritesLocked(system.public_writes_locked);
      setDraft(plainMessageDraft(latestRun(detail.agent_runs)?.structured_output_json?.follow_up_draft ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't load this application.");
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const runCommand = async (command: "process" | "agent-review") => {
    setBusy(command);
    setMessage(null);
    try {
      await apiFetch(`/cases/${id}/${command}`, {
        method: "POST",
        headers: idempotencyHeaders(),
      });
      setMessage(command === "process" ? "Application checks completed." : "Review summary refreshed.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't finish that action.");
    } finally {
      setBusy(null);
    }
  };

  const submitDecision = async (reason: string) => {
    if (!decision) return;
    setBusy("decision");
    try {
      await apiFetch(`/cases/${id}/review-actions`, {
        method: "POST",
        body: JSON.stringify({
          reviewer_id: "Terry Benjamin Jr.",
          action_type: decision.actionType,
          rationale: reason,
          finding_id: decision.findingId ?? null,
        }),
      });
      setDecision(null);
      setMessage("Next step saved.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't save that step.");
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (draft.trim().length < 10) {
      setMessage("Add a little more detail before saving the draft.");
      return;
    }
    setBusy("draft");
    try {
      await apiFetch(`/cases/${id}/review-actions`, {
        method: "POST",
        body: JSON.stringify({
          reviewer_id: "Terry Benjamin Jr.",
          action_type: "EDIT_AGENT_DRAFT",
          rationale: "Reviewed and edited the information request.",
          edited_draft: draft,
        }),
      });
      setMessage("Draft saved.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't save the draft.");
    } finally {
      setBusy(null);
    }
  };

  const assignToMe = async () => {
    setBusy("assign");
    try {
      await apiFetch(`/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned_reviewer_id: "Terry Benjamin Jr." }),
      });
      setMessage("Assigned to Terry Benjamin Jr.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't update the reviewer.");
    } finally {
      setBusy(null);
    }
  };

  const sortedFields = useMemo(
    () => [...(caseRecord?.extracted_fields ?? [])].sort((a, b) => a.field_name.localeCompare(b.field_name)),
    [caseRecord],
  );

  const documentsById = useMemo(
    () => new Map((caseRecord?.documents ?? []).map((document) => [document.id, document])),
    [caseRecord],
  );

  if (error) {
    return <div className="page-pad"><ErrorState detail={error} onRetry={load} /></div>;
  }

  if (!caseRecord) {
    return <PageLoading label="Loading application" />;
  }

  const agentRun = latestRun(caseRecord.agent_runs);
  const agentOutput = agentRun?.structured_output_json;
  const openFindings = caseRecord.findings.filter((finding) => finding.status === "OPEN");
  const statusGuidance = guidance[caseRecord.stage as keyof typeof guidance];
  const { received: receivedDocuments, required: requiredDocuments } = documentProgress(
    caseRecord.completeness_breakdown,
  );
  const findingsById = new Map(caseRecord.findings.map((finding) => [finding.id, finding]));
  const fieldsById = new Map(caseRecord.extracted_fields.map((field) => [field.id, field]));
  const purpose = caseRecord.funding_purpose.trim().replace(/[.]+$/, "");
  const purposeText = purpose ? purpose.charAt(0).toLowerCase() + purpose.slice(1) : "support the business";
  const caseEvidence: Record<string, { label: string; claim: string }> = {
    legal_business_name: { label: "Business name", claim: caseRecord.legal_business_name },
    registration_number: { label: "Registration number", claim: caseRecord.registration_number },
    jurisdiction: { label: "Country or territory", claim: caseRecord.jurisdiction },
    industry: { label: "Industry", claim: caseRecord.industry },
    requested_amount: {
      label: "Amount requested",
      claim: money(caseRecord.requested_amount, caseRecord.currency),
    },
    funding_purpose: { label: "Use of funds", claim: caseRecord.funding_purpose },
    annual_revenue: {
      label: "Annual revenue",
      claim: money(caseRecord.annual_revenue, caseRecord.currency),
    },
    stage: { label: "Status", claim: stageLabel(caseRecord.stage) },
    completeness_score: {
      label: "Documents",
      claim: `${receivedDocuments} of ${requiredDocuments} required documents received`,
    },
  };
  const recommendationReason = caseRecord.stage === "READY_FOR_HUMAN_REVIEW"
    ? "All required documents are present and no open issues were found."
    : caseRecord.stage === "NEEDS_INFORMATION"
      ? `${openFindings.length} item${openFindings.length === 1 ? " needs" : "s need"} to be added or updated before the review can continue.`
      : caseRecord.stage === "MANUAL_INVESTIGATION"
        ? `${openFindings.length} detail${openFindings.length === 1 ? " needs" : "s need"} a closer look because the application and documents do not match.`
        : "Check the application and choose what should happen next.";
  const canProcess = [
    "DRAFT",
    "EXTRACTION_FAILED",
    "NEEDS_INFORMATION",
    "MANUAL_INVESTIGATION",
    "READY_FOR_HUMAN_REVIEW",
  ].includes(caseRecord.stage);
  const canRunAgent = [
    "AGENT_REVIEW",
    "NEEDS_INFORMATION",
    "MANUAL_INVESTIGATION",
    "READY_FOR_HUMAN_REVIEW",
  ].includes(caseRecord.stage);

  return (
    <div className="workspace-page">
      <header className="workspace-head">
        <div className="workspace-breadcrumb">
          <Link href="/cases"><ArrowLeft size={14} /> Applications</Link>
          <span>/</span>
          <strong>{caseRecord.reference}</strong>
        </div>
        <div className="workspace-title-row">
          <div className="workspace-identity">
            <span>{caseRecord.legal_business_name.charAt(0)}</span>
            <div>
              <h1>{caseRecord.legal_business_name}</h1>
              <p>{caseRecord.trading_name ? `${caseRecord.trading_name} · ` : ""}{caseRecord.jurisdiction} · {caseRecord.industry}</p>
            </div>
          </div>
          <div className="workspace-state">
            <StageBadge stage={caseRecord.stage} />
            <span>Updated {dateTime(caseRecord.updated_at)}</span>
          </div>
        </div>
      </header>

      <div className="workflow-ribbon" aria-label="Application progress">
        <div className="complete"><span><Check size={12} /></span><p>Received</p></div>
        <i />
        <div className="complete"><span><Check size={12} /></span><p>Documents checked</p></div>
        <i />
        <div className={agentRun ? "complete" : caseRecord.stage === "AGENT_REVIEW" ? "current" : ""}><span>{agentRun ? <Check size={12} /> : "3"}</span><p>Review ready</p></div>
        <i />
        <div className={caseRecord.stage === "APPROVED_FOR_NEXT_STAGE" ? "complete" : "current"}><span>{caseRecord.stage === "APPROVED_FOR_NEXT_STAGE" ? <Check size={12} /> : "4"}</span><p>Decision</p></div>
      </div>

      <div className="workspace-body">
        {statusGuidance ? (
          <div className={`case-guidance guidance-${statusGuidance.tone}`}>
            {statusGuidance.tone === "ready" ? <CheckCircle size={22} weight="duotone" /> : statusGuidance.tone === "warning" ? <Info size={22} weight="duotone" /> : <WarningCircle size={22} weight="duotone" />}
            <div><strong>{statusGuidance.title}</strong><span>{statusGuidance.text}</span></div>
          </div>
        ) : null}

        {publicWritesLocked ? (
          <div className="workspace-message showcase-lock" role="status">
            <Info size={17} /> Demo mode: changes are turned off.
          </div>
        ) : null}

        {message ? (
          <div className="workspace-message" role="status">
            <Info size={17} /> {message}
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">×</button>
          </div>
        ) : null}

        <section className="case-facts">
          <div><span>Amount requested</span><strong>{money(caseRecord.requested_amount, caseRecord.currency)}</strong><small>{caseRecord.funding_purpose}</small></div>
          <div><span>Registration</span><strong>{caseRecord.registration_number}</strong><small>{caseRecord.jurisdiction}</small></div>
          <div className="readiness-fact"><span>Documents</span><strong>{receivedDocuments} of {requiredDocuments}</strong><small>required items received</small></div>
          <div><span>Reviewer</span><strong>{caseRecord.assigned_reviewer_id ?? "Unassigned"}</strong><small>{caseRecord.assigned_reviewer_id ? "Assigned" : "Choose a reviewer before deciding"}</small></div>
        </section>

        <div className="workspace-actions">
          <details className="more-actions">
            <summary>More actions</summary>
            <div>
              {!caseRecord.assigned_reviewer_id ? (
                <button type="button" className="button button-secondary" onClick={assignToMe} disabled={Boolean(busy) || publicWritesLocked}>
                  <UserCircle size={17} /> {busy === "assign" ? "Assigning" : "Assign to me"}
                </button>
              ) : null}
              {canProcess ? (
                <button type="button" className="button button-secondary" onClick={() => runCommand("process")} disabled={Boolean(busy) || publicWritesLocked}>
                  {busy === "process" ? <SpinnerGap className="spinner" size={16} /> : <Play size={16} />}
                  Check documents again
                </button>
              ) : null}
              {canRunAgent ? (
                <button type="button" className="button button-secondary" onClick={() => runCommand("agent-review")} disabled={Boolean(busy) || publicWritesLocked}>
                  {busy === "agent-review" ? <SpinnerGap className="spinner" size={16} /> : <ClipboardText size={16} />}
                  Refresh summary
                </button>
              ) : null}
            </div>
          </details>
          <div>
            <a className="button button-secondary" href={assetUrl(`/cases/${caseRecord.id}/packet.pdf`)} target="_blank" rel="noreferrer">
              <DownloadSimple size={16} /> Download review
            </a>
            {caseRecord.stage === "READY_FOR_HUMAN_REVIEW" ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setDecision({
                  actionType: "APPROVE_FOR_NEXT_STAGE",
                  title: "Approve this application for the next step?",
                  detail: "Check the documents and summary, then add a reason.",
                  confirmLabel: "Approve for next step",
                })}
              >
                <ShieldCheck size={17} /> Approve for next step
              </button>
            ) : null}
          </div>
        </div>

        <nav className="workspace-tabs" aria-label="Application sections">
          <button type="button" className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>
            <ClipboardText size={17} /> Summary <span>{openFindings.length}</span>
          </button>
          <button type="button" className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>
            <FileText size={17} /> Documents <span>{caseRecord.documents.length}</span>
          </button>
          <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            <ClockCounterClockwise size={17} /> History <span>{caseRecord.audit_events.length}</span>
          </button>
        </nav>

        {tab === "summary" ? (
          <div className="review-grid">
            <div className="review-primary">
              <section className="review-section">
                <div className="section-heading">
                  <div><h2>Items to check</h2><p>{openFindings.length ? "Resolve these before moving forward." : "This application has no open issues."}</p></div>
                  <span className="item-count">{openFindings.length} open</span>
                </div>
                {caseRecord.findings.length ? (
                  <div className="finding-list">
                    {caseRecord.findings.map((finding) => (
                      <FindingRow
                        key={finding.id}
                        finding={finding}
                        onResolve={() => setDecision({
                          actionType: "RECORD_RESOLUTION_NOTE",
                          findingId: finding.id,
                          title: "Add a note to this item?",
                          detail: "Describe what you checked or what still needs attention.",
                          confirmLabel: "Save note",
                        })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="clear-findings">
                    <CheckCircle size={24} weight="duotone" />
                    <div><strong>No issues found</strong><span>The required documents are present and the details match.</span></div>
                  </div>
                )}
              </section>

              <section className="review-section agent-section">
                <div className="section-heading">
                  <div><h2>Review summary</h2><p>Check the suggestion against the documents.</p></div>
                </div>
                {agentOutput ? (
                  <div className="agent-analysis">
                    <div className="agent-summary">
                      <p>
                        {caseRecord.legal_business_name} is requesting {money(caseRecord.requested_amount, caseRecord.currency)}. The funds would be used to {purposeText}.
                      </p>
                    </div>
                    <div className="agent-recommendation">
                      <span>Suggested next step</span>
                      <strong>{stageLabel(agentOutput.recommended_action)}</strong>
                      <p>{recommendationReason}</p>
                    </div>
                    <details className="source-disclosure">
                      <summary>Information used for this summary ({agentOutput.evidence_summary.length})</summary>
                      <div className="citation-list">
                        {agentOutput.evidence_summary.map((citation, index) => {
                          const finding = findingsById.get(citation.citation_id);
                          const document = documentsById.get(citation.citation_id);
                          const field = fieldsById.get(citation.citation_id);
                          const caseField = citation.citation_id.startsWith(`case:${caseRecord.id}:`)
                            ? citation.citation_id.split(":").at(-1)
                            : null;
                          let label = "Application information";
                          let claim = "Used to prepare this summary.";

                          if (finding) {
                            label = issueLabel(finding.rule_code);
                            claim = findingText(finding.rule_code, finding.message);
                          } else if (document) {
                            label = documentLabel(document.document_type);
                            claim = `${document.original_filename} was reviewed.`;
                          } else if (field) {
                            const sourceDocument = documentsById.get(field.document_id);
                            label = issueLabel(field.field_name);
                            claim = `${String(field.normalized_value)}${sourceDocument ? `, found in ${documentLabel(sourceDocument.document_type)}` : ""}.`;
                          } else if (citation.citation_id.startsWith("policy:")) {
                            label = "Document checklist";
                            claim = "The standard application checklist was used.";
                          } else if (caseField && caseEvidence[caseField]) {
                            ({ label, claim } = caseEvidence[caseField]);
                          }

                          return (
                            <div key={`${citation.citation_id}-${index}`}>
                              <span>{index + 1}</span>
                              <p><strong>{label}</strong>{claim}</p>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="agent-empty"><ClipboardText size={26} weight="duotone" /><strong>Summary not ready</strong><span>Check the documents, then refresh the summary.</span></div>
                )}
              </section>
            </div>

            <aside className="review-rail">
              {agentOutput?.follow_up_draft ? (
                <section className="draft-editor">
                  <h2>Message draft</h2>
                  <p>Review the wording before copying it into your email.</p>
                  <textarea aria-label="Message draft" className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
                  <div className="draft-boundary"><Warning size={15} /> OpsLedger does not send email.</div>
                  <button type="button" className="button button-primary" onClick={saveDraft} disabled={Boolean(busy) || publicWritesLocked}>
                    {busy === "draft" ? <SpinnerGap className="spinner" size={15} /> : <NotePencil size={15} />}
                    Save draft
                  </button>
                </section>
              ) : null}

              <section className="review-controls">
                <h2>Next step</h2>
                <p>Choose what should happen with this application.</p>
                {caseRecord.stage !== "APPROVED_FOR_NEXT_STAGE" && caseRecord.stage !== "CLOSED" ? (
                  <>
                    {caseRecord.stage !== "NEEDS_INFORMATION" ? (
                      <button type="button" onClick={() => setDecision({
                        actionType: "REQUEST_INFORMATION",
                        title: "Ask for more information?",
                        detail: "Use the message draft or contact the business after you save this step.",
                        confirmLabel: "Save request",
                      })}><Info size={18} /><span><strong>Ask for information</strong><small>Wait for updated documents</small></span><ArrowRight size={15} /></button>
                    ) : null}
                    {caseRecord.stage !== "MANUAL_INVESTIGATION" ? (
                      <button type="button" onClick={() => setDecision({
                        actionType: "SEND_TO_MANUAL_INVESTIGATION",
                        title: "Send this for a closer look?",
                        detail: "Use this when the documents do not match or another reviewer needs to investigate.",
                        confirmLabel: "Send for review",
                        tone: "danger",
                      })}><MagnifyingGlass size={18} /><span><strong>Send for a closer look</strong><small>Ask another reviewer to investigate</small></span><ArrowRight size={15} /></button>
                    ) : null}
                  </>
                ) : (
                  <div className="control-complete"><CheckCircle size={21} /><span><strong>Decision saved</strong><small>Open History to read the note.</small></span></div>
                )}
              </section>

              <section className="contact-block">
                <span>Contact</span>
                <strong>{caseRecord.contact_name}</strong>
                <a href={`mailto:${caseRecord.contact_email}`}>{caseRecord.contact_email}</a>
                <small>Opens in your email app.</small>
              </section>
            </aside>
          </div>
        ) : null}

        {tab === "documents" ? (
          <div className="evidence-layout">
            <section>
              <div className="section-heading">
                <div><h2>Documents</h2><p>Open a file to review it.</p></div>
              </div>
              <div className="document-list">
                {caseRecord.documents.map((document) => (
                  <a key={document.id} href={assetUrl(`/cases/${caseRecord.id}/documents/${document.id}`)} className="document-row" target="_blank" rel="noreferrer">
                    <span className="document-icon"><File size={20} weight="duotone" /></span>
                    <span><strong>{document.original_filename}</strong><small>{documentLabel(document.document_type)} · {document.page_count ? `${document.page_count} page${document.page_count === 1 ? "" : "s"}` : fileTypeLabel(document.mime_type)}</small></span>
                    <span className="extraction-ok"><Check size={13} /> Ready</span>
                    <DownloadSimple size={17} />
                  </a>
                ))}
              </div>
            </section>
            <section className="extracted-section">
              <div className="section-heading">
                <div><h2>Details found in the documents</h2><p>Check these values against the original files.</p></div>
                <span className="item-count">{sortedFields.length} details</span>
              </div>
              <div className="field-ledger">
                <div className="field-ledger-head"><span>Detail</span><span>Value</span><span>Found in</span></div>
                {sortedFields.map((field) => {
                  const sourceDocument = documentsById.get(field.document_id);
                  return (
                    <div key={field.id}>
                      <strong>{issueLabel(field.field_name)}</strong>
                      <span>{["bank_ending_balance", "revenue_computed_total", "revenue_declared_total"].includes(field.field_name) ? money(String(field.normalized_value), caseRecord.currency) : String(field.normalized_value)}</span>
                      <span>{sourceDocument ? documentLabel(sourceDocument.document_type) : "Document"} · {sourceLabel(field.source_locator)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "history" ? (
          <section className="audit-case-section">
            <div className="section-heading">
              <div><h2>Application history</h2><p>Newest updates appear first.</p></div>
              <span className="item-count">{caseRecord.audit_events.length} updates</span>
            </div>
            <div className="case-audit-list">
              {[...caseRecord.audit_events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((event) => (
                <div key={event.id}>
                  <span className={`audit-actor actor-${event.actor_type}`}>
                    {event.actor_type === "user" ? <UserCircle size={17} /> : <ClockCounterClockwise size={17} />}
                  </span>
                  <div><strong>{eventLabel(event.event_type, event.summary)}</strong><p>{actorLabel(event.actor_type)}</p></div>
                  <time>{dateTime(event.created_at)}</time>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <DecisionDialog
        open={Boolean(decision)}
        title={decision?.title ?? "Save this step?"}
        detail={decision?.detail ?? "Check the application before continuing."}
        confirmLabel={decision?.confirmLabel ?? "Save"}
        tone={decision?.tone}
        busy={busy === "decision"}
        locked={publicWritesLocked}
        onClose={() => setDecision(null)}
        onConfirm={submitDecision}
      />
    </div>
  );
}

function FindingRow({ finding, onResolve }: { finding: Finding; onResolve: () => void }) {
  const resolved = finding.status === "RESOLVED";
  return (
    <div className={`finding-row ${resolved ? "resolved" : ""}`}>
      <span className={`finding-icon severity-${finding.severity.toLowerCase()}`}>
        {resolved ? <CheckCircle size={20} /> : <WarningCircle size={20} />}
      </span>
      <div>
        <strong>{issueLabel(finding.rule_code)}</strong>
        <p>{findingText(finding.rule_code, finding.message)}</p>
        {finding.resolution_note ? <p>Note: {finding.resolution_note}</p> : null}
      </div>
      {!resolved ? <button type="button" className="button button-quiet" onClick={onResolve}>Add note</button> : null}
    </div>
  );
}
