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
  IdentificationCard,
  Info,
  MagnifyingGlass,
  NotePencil,
  Play,
  Robot,
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
import { ApiRequestError, apiFetch, assetUrl, idempotencyHeaders } from "@/lib/api";
import { dateTime, money, sentenceCase, shortHash } from "@/lib/format";
import type { AgentRun, CaseDetail, Finding } from "@/lib/types";

type WorkspaceTab = "review" | "evidence" | "audit";

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
    title: "The package is ready for a person",
    text: "Required evidence is present and deterministic checks found no open exception. Review cited evidence before recording an approval.",
    tone: "ready",
  },
  NEEDS_INFORMATION: {
    title: "The workflow needs current or missing evidence",
    text: "Review the blocking findings and edit the prepared follow-up. Nothing will be sent from OpsLedger.",
    tone: "warning",
  },
  MANUAL_INVESTIGATION: {
    title: "Identity or duplicate evidence needs investigation",
    text: "The case is held. Resolve the named conflicts outside the agent before changing its workflow state.",
    tone: "danger",
  },
  APPROVED_FOR_NEXT_STAGE: {
    title: "A reviewer approved the next workflow stage",
    text: "The approval and rationale are preserved in the audit ledger. This is not a financing decision.",
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
  const [tab, setTab] = useState<WorkspaceTab>("review");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionConfig | null>(null);
  const [draft, setDraft] = useState("");

  const load = async () => {
    setError(null);
    try {
      const detail = await apiFetch<CaseDetail>(`/cases/${id}`);
      setCaseRecord(detail);
      setDraft(latestRun(detail.agent_runs)?.structured_output_json?.follow_up_draft ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The case workspace could not load.");
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
      setMessage(
        command === "process"
          ? "Deterministic extraction and validation completed."
          : "The bounded review completed and passed grounding checks.",
      );
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The command could not complete.");
    } finally {
      setBusy(null);
    }
  };

  const submitDecision = async (rationale: string) => {
    if (!decision) return;
    setBusy("decision");
    try {
      await apiFetch(`/cases/${id}/review-actions`, {
        method: "POST",
        body: JSON.stringify({
          reviewer_id: "Terry Benjamin Jr.",
          action_type: decision.actionType,
          rationale,
          finding_id: decision.findingId ?? null,
        }),
      });
      setDecision(null);
      setMessage("Reviewer action recorded in the audit ledger.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The reviewer action was not recorded.");
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (draft.trim().length < 10) {
      setMessage("The follow-up draft is too short to save.");
      return;
    }
    setBusy("draft");
    try {
      await apiFetch(`/cases/${id}/review-actions`, {
        method: "POST",
        body: JSON.stringify({
          reviewer_id: "Terry Benjamin Jr.",
          action_type: "EDIT_AGENT_DRAFT",
          rationale: "Reviewed and edited the prepared information request.",
          edited_draft: draft,
        }),
      });
      setMessage("Draft saved. No message was sent.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The draft could not be saved.");
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
      setMessage("Case assigned to Terry Benjamin Jr.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Assignment could not be updated.");
    } finally {
      setBusy(null);
    }
  };

  const sortedFields = useMemo(
    () => [...(caseRecord?.extracted_fields ?? [])].sort((a, b) => a.field_name.localeCompare(b.field_name)),
    [caseRecord],
  );

  if (error) {
    return <div className="page-pad"><ErrorState detail={error} onRetry={load} /></div>;
  }

  if (!caseRecord) {
    return <PageLoading label="Opening evidence workspace" />;
  }

  const agentRun = latestRun(caseRecord.agent_runs);
  const agentOutput = agentRun?.structured_output_json;
  const openFindings = caseRecord.findings.filter((finding) => finding.status === "OPEN");
  const statusGuidance = guidance[caseRecord.stage as keyof typeof guidance];
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
          <Link href="/cases"><ArrowLeft size={14} /> Cases</Link>
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
            <span>Version {caseRecord.version} · updated {dateTime(caseRecord.updated_at)}</span>
          </div>
        </div>
      </header>

      <div className="workflow-ribbon" aria-label="Workflow progress">
        <div className="complete"><span><Check size={12} /></span><p>Intake captured<small>Case record</small></p></div>
        <i />
        <div className="complete"><span><Check size={12} /></span><p>Rules evaluated<small>{caseRecord.findings.length} finding{caseRecord.findings.length === 1 ? "" : "s"}</small></p></div>
        <i />
        <div className={agentRun ? "complete" : caseRecord.stage === "AGENT_REVIEW" ? "current" : ""}><span>{agentRun ? <Check size={12} /> : "3"}</span><p>Bounded review<small>{agentRun ? agentRun.model_provider : "Awaiting run"}</small></p></div>
        <i />
        <div className={caseRecord.stage === "APPROVED_FOR_NEXT_STAGE" ? "complete" : "current"}><span>{caseRecord.stage === "APPROVED_FOR_NEXT_STAGE" ? <Check size={12} /> : "4"}</span><p>Human gate<small>{caseRecord.stage === "APPROVED_FOR_NEXT_STAGE" ? "Recorded" : "Reviewer owned"}</small></p></div>
      </div>

      <div className="workspace-body">
        {statusGuidance ? (
          <div className={`case-guidance guidance-${statusGuidance.tone}`}>
            {statusGuidance.tone === "ready" ? <CheckCircle size={21} weight="duotone" /> : statusGuidance.tone === "warning" ? <Info size={21} weight="duotone" /> : <WarningCircle size={21} weight="duotone" />}
            <div><strong>{statusGuidance.title}</strong><span>{statusGuidance.text}</span></div>
          </div>
        ) : null}

        {message ? (
          <div className="workspace-message" role="status">
            <Info size={16} /> {message}
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">×</button>
          </div>
        ) : null}

        <section className="case-facts">
          <div><span>Financing request</span><strong>{money(caseRecord.requested_amount, caseRecord.currency)}</strong><small>{caseRecord.funding_purpose}</small></div>
          <div><span>Registration</span><strong>{caseRecord.registration_number}</strong><small>{caseRecord.jurisdiction}</small></div>
          <div className="readiness-fact"><span>Package readiness</span><strong>{caseRecord.completeness_score}<i>/100</i></strong><small>{caseRecord.documents.length} evidence files stored</small></div>
          <div><span>Assigned reviewer</span><strong>{caseRecord.assigned_reviewer_id ?? "Unassigned"}</strong><small>{caseRecord.assigned_reviewer_id ? "Human owner recorded" : "Take ownership before deciding"}</small></div>
        </section>

        <div className="workspace-actions">
          <div>
            {!caseRecord.assigned_reviewer_id ? (
              <button type="button" className="button button-secondary" onClick={assignToMe} disabled={Boolean(busy)}>
                <UserCircle size={17} /> {busy === "assign" ? "Assigning" : "Assign to me"}
              </button>
            ) : null}
            {canProcess ? (
              <button type="button" className="button button-secondary" onClick={() => runCommand("process")} disabled={Boolean(busy)}>
                {busy === "process" ? <SpinnerGap className="spinner" size={16} /> : <Play size={16} />}
                Re-run deterministic checks
              </button>
            ) : null}
            {canRunAgent ? (
              <button type="button" className="button button-dark" onClick={() => runCommand("agent-review")} disabled={Boolean(busy)}>
                {busy === "agent-review" ? <SpinnerGap className="spinner" size={16} /> : <Robot size={16} />}
                Re-run bounded review
              </button>
            ) : null}
          </div>
          <div>
            <a className="button button-secondary" href={assetUrl(`/cases/${caseRecord.id}/packet.pdf`)} target="_blank" rel="noreferrer">
              <DownloadSimple size={16} /> Review packet
            </a>
            {caseRecord.stage === "READY_FOR_HUMAN_REVIEW" ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setDecision({
                  actionType: "APPROVE_FOR_NEXT_STAGE",
                  title: "Approve the next workflow stage?",
                  detail: "Confirm that you reviewed the cited evidence and open findings. The audit ledger will preserve your rationale.",
                  confirmLabel: "Record approval",
                })}
              >
                <ShieldCheck size={17} /> Approve next stage
              </button>
            ) : null}
          </div>
        </div>

        <nav className="workspace-tabs" aria-label="Case workspace sections">
          <button type="button" className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>
            <ClipboardText size={16} /> Review <span>{openFindings.length}</span>
          </button>
          <button type="button" className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}>
            <FileText size={16} /> Evidence <span>{caseRecord.documents.length}</span>
          </button>
          <button type="button" className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>
            <ClockCounterClockwise size={16} /> Audit trail <span>{caseRecord.audit_events.length}</span>
          </button>
        </nav>

        {tab === "review" ? (
          <div className="review-grid">
            <div className="review-primary">
              <section className="review-section">
                <div className="section-heading">
                  <div><h2>Deterministic findings</h2><p>Rules route the workflow before the model is called.</p></div>
                  <span className="mono-label">{openFindings.length} open</span>
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
                          title: "Record a resolution note?",
                          detail: "Document what evidence you checked. Re-run deterministic checks before changing the case route.",
                          confirmLabel: "Save resolution note",
                        })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="clear-findings">
                    <CheckCircle size={24} weight="duotone" />
                    <div><strong>No open deterministic exception</strong><span>Required evidence, recency, identity, duplication, totals, and currency checks passed.</span></div>
                  </div>
                )}
              </section>

              <section className="review-section agent-section">
                <div className="section-heading">
                  <div><h2>Bounded agent analysis</h2><p>Schema-validated summary grounded in typed tool results.</p></div>
                  {agentRun ? <span className="model-tag"><Robot size={13} /> {agentRun.model_provider}</span> : null}
                </div>
                {agentOutput ? (
                  <div className="agent-analysis">
                    <div className="agent-summary">
                      <span className="mono-label">Case summary</span>
                      <p>{agentOutput.case_summary}</p>
                    </div>
                    <div className="agent-recommendation">
                      <span>Proposed workflow action</span>
                      <strong>{sentenceCase(agentOutput.recommended_action)}</strong>
                      <p>{agentOutput.recommendation_reason}</p>
                    </div>
                    <div className="citation-list">
                      <span className="mono-label">Evidence citations</span>
                      {agentOutput.evidence_summary.map((citation, index) => (
                        <div key={`${citation.citation_id}-${index}`}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <p><strong>{citation.label}</strong>{citation.claim}</p>
                          <code>{citation.citation_id.slice(0, 18)}{citation.citation_id.length > 18 ? "…" : ""}</code>
                        </div>
                      ))}
                    </div>
                    <div className="agent-limits">
                      <Info size={17} />
                      <div>{agentOutput.limitations.map((item) => <p key={item}>{item}</p>)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="agent-empty"><Robot size={25} weight="duotone" /><strong>No bounded review saved</strong><span>Run the agent after deterministic checks finish.</span></div>
                )}
              </section>
            </div>

            <aside className="review-rail">
              {agentOutput?.follow_up_draft ? (
                <section className="draft-editor">
                  <span className="mono-label">Prepared follow-up</span>
                  <h2>Edit before use</h2>
                  <p>The agent prepared this draft from missing-information findings. OpsLedger cannot send it.</p>
                  <textarea className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
                  <div className="draft-boundary"><Warning size={14} /> Sending is disabled by design.</div>
                  <button type="button" className="button button-primary" onClick={saveDraft} disabled={Boolean(busy)}>
                    {busy === "draft" ? <SpinnerGap className="spinner" size={15} /> : <NotePencil size={15} />}
                    Save reviewer edit
                  </button>
                </section>
              ) : null}

              <section className="review-controls">
                <span className="mono-label">Human controls</span>
                <h2>Choose the workflow route</h2>
                <p>Every action requires a rationale and becomes part of the ledger.</p>
                {caseRecord.stage !== "APPROVED_FOR_NEXT_STAGE" && caseRecord.stage !== "CLOSED" ? (
                  <>
                    {caseRecord.stage !== "NEEDS_INFORMATION" ? (
                      <button type="button" onClick={() => setDecision({
                        actionType: "REQUEST_INFORMATION",
                        title: "Move this case to needs information?",
                        detail: "Use this when the current package cannot support continued review. No follow-up will be sent automatically.",
                        confirmLabel: "Record information request",
                      })}><Info size={17} /><span><strong>Request information</strong><small>Hold for updated evidence</small></span><ArrowRight size={14} /></button>
                    ) : null}
                    {caseRecord.stage !== "MANUAL_INVESTIGATION" ? (
                      <button type="button" onClick={() => setDecision({
                        actionType: "SEND_TO_MANUAL_INVESTIGATION",
                        title: "Hold for manual investigation?",
                        detail: "Use this for identity, duplication, or evidence conflicts that require a person outside the bounded review.",
                        confirmLabel: "Record investigation hold",
                        tone: "danger",
                      })}><MagnifyingGlass size={17} /><span><strong>Manual investigation</strong><small>Escalate an evidence conflict</small></span><ArrowRight size={14} /></button>
                    ) : null}
                  </>
                ) : (
                  <div className="control-complete"><CheckCircle size={20} /><span><strong>Human action recorded</strong><small>See the audit trail for rationale.</small></span></div>
                )}
              </section>

              <section className="contact-block">
                <span className="mono-label">Applicant contact</span>
                <strong>{caseRecord.contact_name}</strong>
                <a href={`mailto:${caseRecord.contact_email}`}>{caseRecord.contact_email}</a>
                <small>External contact only. OpsLedger does not send.</small>
              </section>
            </aside>
          </div>
        ) : null}

        {tab === "evidence" ? (
          <div className="evidence-layout">
            <section>
              <div className="section-heading">
                <div><h2>Stored documents</h2><p>Private evidence with hash, parser status, and source metadata.</p></div>
              </div>
              <div className="document-list">
                {caseRecord.documents.map((document) => (
                  <a key={document.id} href={assetUrl(`/cases/${caseRecord.id}/documents/${document.id}`)} className="document-row">
                    <span className="document-icon"><File size={19} weight="duotone" /></span>
                    <span><strong>{document.original_filename}</strong><small>{sentenceCase(document.document_type)} · {document.page_count ? `${document.page_count} page${document.page_count === 1 ? "" : "s"}` : document.mime_type}</small></span>
                    <code>{shortHash(document.sha256)}</code>
                    <span className="extraction-ok"><Check size={12} /> {sentenceCase(document.extraction_status)}</span>
                    <DownloadSimple size={16} />
                  </a>
                ))}
              </div>
            </section>
            <section className="extracted-section">
              <div className="section-heading">
                <div><h2>Extracted fields</h2><p>Normalized values remain linked to their source locator.</p></div>
                <span className="mono-label">{sortedFields.length} values</span>
              </div>
              <div className="field-ledger">
                <div className="field-ledger-head"><span>Field</span><span>Normalized value</span><span>Source</span><span>Confidence</span></div>
                {sortedFields.map((field) => (
                  <div key={field.id}>
                    <strong>{sentenceCase(field.field_name)}</strong>
                    <span>{String(field.normalized_value)}</span>
                    <code>{field.source_locator}</code>
                    <span>{Math.round(field.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "audit" ? (
          <section className="audit-case-section">
            <div className="section-heading">
              <div><h2>Append-only case history</h2><p>Actors, transitions, and correlations in newest-first order.</p></div>
              <span className="mono-label">{caseRecord.audit_events.length} events</span>
            </div>
            <div className="case-audit-list">
              {[...caseRecord.audit_events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((event) => (
                <div key={event.id}>
                  <span className={`audit-actor actor-${event.actor_type}`}>
                    {event.actor_type === "agent" ? <Robot size={16} /> : event.actor_type === "user" ? <UserCircle size={16} /> : <ShieldCheck size={16} />}
                  </span>
                  <div><strong>{event.summary}</strong><p>{sentenceCase(event.event_type)} · {event.actor_id}</p></div>
                  <code>{event.correlation_id.slice(0, 18)}{event.correlation_id.length > 18 ? "…" : ""}</code>
                  <time>{dateTime(event.created_at)}</time>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <DecisionDialog
        open={Boolean(decision)}
        title={decision?.title ?? "Record reviewer action"}
        detail={decision?.detail ?? "Review the evidence before continuing."}
        confirmLabel={decision?.confirmLabel ?? "Record action"}
        tone={decision?.tone}
        busy={busy === "decision"}
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
        {resolved ? <CheckCircle size={19} /> : <WarningCircle size={19} />}
      </span>
      <div>
        <span className="finding-meta"><code>{finding.rule_code}</code><i>{finding.severity}</i>{resolved ? <i>Resolved</i> : null}</span>
        <strong>{finding.message}</strong>
        {finding.resolution_note ? <p>Resolution: {finding.resolution_note}</p> : null}
      </div>
      {!resolved ? <button type="button" className="button button-quiet" onClick={onResolve}>Record note</button> : null}
    </div>
  );
}
