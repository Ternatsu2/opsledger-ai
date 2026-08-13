"use client";

import {
  CheckCircle,
  ClockCounterClockwise,
  FileLock,
  UserCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ErrorState, PageLoading } from "@/components/states";
import { apiFetch } from "@/lib/api";
import { actorLabel, dateTime, eventLabel } from "@/lib/format";
import type { AuditEvent, CaseRecord, SystemStatus } from "@/lib/types";

export default function ActivityPage() {
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
      setError(caught instanceof Error ? caught.message : "We couldn't load the activity.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleEvents = useMemo(
    () => (events ?? []).filter((event) => {
      if (actor === "ALL") return true;
      if (actor === "OPSLEDGER") return event.actor_type !== "user";
      return event.actor_type === actor;
    }),
    [actor, events],
  );
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);

  if (error) return <div className="page-pad"><ErrorState detail={error} onRetry={load} /></div>;
  if (!system || !events) return <PageLoading label="Loading activity" />;

  return (
    <div className="page-pad trust-page">
      <header className="activity-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-lead">See what changed, who changed it, and when.</p>
      </header>

      <section className="global-audit activity-section">
        <div className="section-heading">
          <div><h2>Application updates</h2><p>Newest updates appear first.</p></div>
          <label className="audit-filter">
            <span>Updated by</span>
            <select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="ALL">Everyone</option>
              <option value="OPSLEDGER">OpsLedger</option>
              <option value="user">Reviewer</option>
            </select>
          </label>
        </div>

        <div className="audit-table activity-table panel">
          <div className="audit-head" aria-hidden="true"><span>Update</span><span>Application</span><span>Updated by</span><span>Time</span></div>
          {visibleEvents.map((event) => {
            const relatedCase = event.case_id ? caseById.get(event.case_id) : undefined;
            return (
              <div className="audit-row" key={event.id}>
                <span className={`audit-event-icon actor-${event.actor_type}`}>
                  {event.actor_type === "user" ? <UserCircle size={17} /> : <ClockCounterClockwise size={17} />}
                </span>
                <span className="audit-event-copy"><strong>{eventLabel(event.event_type, event.summary)}</strong></span>
                <span className="activity-case">{relatedCase ? <Link href={`/cases/${relatedCase.id}`}>{relatedCase.reference}<small>{relatedCase.legal_business_name}</small></Link> : "Workspace"}</span>
                <span className="audit-actor-label">{actorLabel(event.actor_type)}</span>
                <time>{dateTime(event.created_at)}</time>
              </div>
            );
          })}
        </div>
        <div className="ledger-foot"><CheckCircle size={15} /> {visibleEvents.length} updates</div>
      </section>

      <details className="demo-details">
        <summary>About this demo</summary>
        <p>This workspace uses sample applications. Signed-out visitors can view the workflow but cannot save changes.</p>
        <div className="control-principles" aria-label="How the demo works">
          <div>
            <span><FileLock size={20} /></span>
            <p><strong>Private files</strong>You open documents through the application.</p>
          </div>
          <div>
            <span><CheckCircle size={20} /></span>
            <p><strong>Consistent checks</strong>Each application uses the same document checklist.</p>
          </div>
          <div>
            <span><ClockCounterClockwise size={20} /></span>
            <p><strong>Saved history</strong>You can see each update and who made it.</p>
          </div>
          <div>
            <span><UserCircle size={20} /></span>
            <p><strong>Reviewer approval</strong>A reviewer adds a reason before saving a decision.</p>
          </div>
        </div>
        <p className="demo-boundary">OpsLedger organizes documents for review. It does not decide whether a business receives financing.</p>
        <details className="system-disclosure">
          <summary>Technical details</summary>
          <dl>
            <div><dt>Summary provider</dt><dd>{system.model_provider}</dd></div>
            <div><dt>Configured model</dt><dd>{system.model}</dd></div>
            <div><dt>Policy version</dt><dd>{system.policy_version}</dd></div>
            <div><dt>Sample data</dt><dd>{system.synthetic_data_only ? "Only" : "Restricted"}</dd></div>
            <div><dt>Public changes</dt><dd>{system.public_writes_locked ? "Off" : "On"}</dd></div>
            <div><dt>Message sending</dt><dd>{system.follow_up_auto_send ? "On" : "Off"}</dd></div>
          </dl>
        </details>
      </details>
    </div>
  );
}
