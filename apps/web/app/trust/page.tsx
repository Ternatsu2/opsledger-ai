"use client";

import {
  ArrowRight,
  CheckCircle,
  Database,
  FileLock,
  Fingerprint,
  FlowArrow,
  Robot,
  ShieldCheck,
  UserCircle,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ErrorState, PageLoading } from "@/components/states";
import { apiFetch } from "@/lib/api";
import { dateTime, sentenceCase } from "@/lib/format";
import type { AuditEvent, CaseRecord, SystemStatus } from "@/lib/types";

export default function TrustPage() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [actor, setActor] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [systemResult, eventResult, caseResult] = await Promise.all([
        apiFetch<SystemStatus>("/system"),
        apiFetch<AuditEvent[]>("/audit?limit=200"),
        apiFetch<CaseRecord[]>("/cases"),
      ]);
      setSystem(systemResult);
      setEvents(eventResult);
      setCases(caseResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trust data could not load.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleEvents = useMemo(
    () => (events ?? []).filter((event) => actor === "ALL" || event.actor_type === actor),
    [actor, events],
  );
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);

  if (error) return <div className="page-pad"><ErrorState detail={error} onRetry={load} /></div>;
  if (!system || !events) return <PageLoading label="Loading control evidence" />;

  return (
    <div className="page-pad trust-page">
      <header className="trust-hero">
        <div>
          <div className="page-kicker">Audit & responsible AI</div>
          <h1>Trust should be inspectable, not implied.</h1>
          <p>
            OpsLedger separates evidence handling, deterministic routing, model-assisted
            synthesis, and human authority. Every transition leaves a durable record.
          </p>
        </div>
        <div className="trust-seal">
          <ShieldCheck size={34} weight="duotone" />
          <span>Control status</span>
          <strong>Human gate active</strong>
          <small>Policy {system.policy_version}</small>
        </div>
      </header>

      <section className="control-principles" aria-label="System safeguards">
        <div>
          <span><FileLock size={19} /></span>
          <p><strong>Synthetic evidence only</strong>Private files, allowlisted formats, size limits, hashes, and safe filenames.</p>
        </div>
        <div>
          <span><FlowArrow size={19} /></span>
          <p><strong>Rules own routing</strong>Completeness, recency, identity, totals, duplication, and currency stay deterministic.</p>
        </div>
        <div>
          <span><Robot size={19} /></span>
          <p><strong>Bounded model use</strong>Five typed context tools, schema validation, exact citations, and two attempts at most.</p>
        </div>
        <div>
          <span><UserCircle size={19} /></span>
          <p><strong>A person decides</strong>No approval, applicant contact, or consequential route change happens autonomously.</p>
        </div>
      </section>

      <section className="control-flow-section">
        <div className="section-heading">
          <div><h2>How a case moves</h2><p>Authority narrows as evidence moves toward a human decision.</p></div>
          <span className="mono-label">Separation of concerns</span>
        </div>
        <div className="control-flow">
          <div><span><FileLock size={20} /></span><strong>Evidence store</strong><small>Private objects + SHA-256</small></div>
          <ArrowRight size={16} />
          <div><span><Database size={20} /></span><strong>Parser layer</strong><small>PDF, CSV, XLSX</small></div>
          <ArrowRight size={16} />
          <div><span><FlowArrow size={20} /></span><strong>Rule engine</strong><small>Authoritative route</small></div>
          <ArrowRight size={16} />
          <div><span><Robot size={20} /></span><strong>Bounded agent</strong><small>Summary + citations</small></div>
          <ArrowRight size={16} />
          <div className="human-node"><span><UserCircle size={20} /></span><strong>Reviewer</strong><small>Rationale + action</small></div>
        </div>
      </section>

      <section className="runtime-facts">
        <div className="runtime-copy">
          <span className="mono-label">Runtime disclosure</span>
          <h2>What is running in this environment</h2>
          <p>
            The interface exposes provider state because graceful fallback should be
            visible. It never presents a rules-only result as model-generated analysis.
          </p>
        </div>
        <dl>
          <div><dt>Configured provider</dt><dd>{system.model_provider}</dd></div>
          <div><dt>Local model</dt><dd>{system.model}</dd></div>
          <div><dt>Data mode</dt><dd>{system.synthetic_data_only ? "Synthetic only" : "Restricted"}</dd></div>
          <div><dt>Public writes</dt><dd>{system.public_writes_locked ? "Reviewer authorization required" : "Enabled"}</dd></div>
          <div><dt>Automatic sending</dt><dd>{system.follow_up_auto_send ? "Enabled" : "Disabled"}</dd></div>
        </dl>
        <div className="runtime-warning">
          <Warning size={20} weight="duotone" />
          <p><strong>Not a lending system</strong>OpsLedger assesses workflow readiness. It does not score creditworthiness, decide eligibility, or provide legal or regulatory advice.</p>
        </div>
      </section>

      <section className="global-audit">
        <div className="section-heading">
          <div><h2>Workspace audit ledger</h2><p>Append-only events across every synthetic case.</p></div>
          <label className="audit-filter">
            <span>Actor</span>
            <select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="ALL">All actors</option>
              <option value="system">System</option>
              <option value="agent">Agent</option>
              <option value="user">Reviewer</option>
            </select>
          </label>
        </div>

        <div className="audit-table panel">
          <div className="audit-head" aria-hidden="true"><span>Event</span><span>Case</span><span>Actor</span><span>Correlation</span><span>Time</span></div>
          {visibleEvents.map((event) => {
            const relatedCase = event.case_id ? caseById.get(event.case_id) : undefined;
            return (
              <div className="audit-row" key={event.id}>
                <span className={`audit-event-icon actor-${event.actor_type}`}>
                  {event.actor_type === "agent" ? <Robot size={16} /> : event.actor_type === "user" ? <UserCircle size={16} /> : <Fingerprint size={16} />}
                </span>
                <span className="audit-event-copy"><strong>{event.summary}</strong><small>{sentenceCase(event.event_type)}</small></span>
                <span>{relatedCase ? <Link href={`/cases/${relatedCase.id}`}>{relatedCase.reference}</Link> : "Workspace"}</span>
                <span className="audit-actor-label">{sentenceCase(event.actor_type)}<small>{event.actor_id}</small></span>
                <code>{event.correlation_id.slice(0, 16)}{event.correlation_id.length > 16 ? "…" : ""}</code>
                <time>{dateTime(event.created_at)}</time>
              </div>
            );
          })}
        </div>
        <div className="ledger-foot"><CheckCircle size={14} /> {visibleEvents.length} events shown · no edit or delete control exists</div>
      </section>
    </div>
  );
}
