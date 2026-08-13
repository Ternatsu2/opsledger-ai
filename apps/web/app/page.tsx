import {
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  FilePlus,
  Robot,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { StageBadge } from "@/components/stage-badge";
import { apiFetch } from "@/lib/api";
import { money, relativeTime, sentenceCase } from "@/lib/format";
import type { CaseRecord, DashboardSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, cases] = await Promise.all([
    apiFetch<DashboardSummary>("/dashboard"),
    apiFetch<CaseRecord[]>("/cases"),
  ]);

  const attentionCount = summary.needs_information + summary.manual_investigation;

  return (
    <div className="page-pad dashboard-page">
      <header className="page-header-row">
        <div>
          <div className="page-kicker">Operations desk · 13 August 2026</div>
          <h1 className="page-title">A clear queue. Evidence at every turn.</h1>
          <p className="page-lead">
            Move financing-readiness cases from intake to human review without hiding
            the rules, evidence, or judgment calls behind the workflow.
          </p>
        </div>
        <div className="header-actions">
          <span className="live-indicator"><i /> Demo systems ready</span>
          <Link href="/cases/new" className="button button-primary">
            <FilePlus size={17} /> New intake
          </Link>
        </div>
      </header>

      <section className="queue-overview" aria-labelledby="queue-title">
        <div className="queue-number">
          <span className="mono-label" id="queue-title">Open review queue</span>
          <strong>{summary.open_cases.toString().padStart(2, "0")}</strong>
          <p>
            {summary.ready_for_review} case ready for a person. {attentionCount} need
            operator attention before the workflow can advance.
          </p>
          <Link href="/cases" className="text-link">
            Open full queue <ArrowRight size={14} />
          </Link>
        </div>

        <div className="queue-breakdown">
          <div>
            <span><CheckCircle size={17} /> Ready for review</span>
            <strong>{summary.ready_for_review}</strong>
          </div>
          <div>
            <span><ClockCountdown size={17} /> Needs information</span>
            <strong>{summary.needs_information}</strong>
          </div>
          <div>
            <span><Warning size={17} /> Manual investigation</span>
            <strong>{summary.manual_investigation}</strong>
          </div>
          <div>
            <span><ShieldCheck size={17} /> Human approved</span>
            <strong>{summary.approved}</strong>
          </div>
        </div>

        <div className="control-note">
          <div className="control-note-icon"><Robot size={25} weight="duotone" /></div>
          <span className="mono-label">Control boundary</span>
          <h2>The agent prepares. A reviewer decides.</h2>
          <p>
            Deterministic rules own routing. The bounded agent can summarize cited
            evidence and draft follow-up, but cannot approve or contact an applicant.
          </p>
          <Link href="/trust">Inspect the control design <ArrowRight size={13} /></Link>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>Active cases</h2>
            <p>One operational slice, three clear outcomes.</p>
          </div>
          <Link href="/cases" className="button button-secondary">View all cases</Link>
        </div>

        <div className="case-table panel">
          <div className="case-table-head" aria-hidden="true">
            <span>Applicant</span>
            <span>Request</span>
            <span>Readiness</span>
            <span>Workflow state</span>
            <span />
          </div>
          {cases.slice(0, 5).map((caseRecord) => (
            <Link
              key={caseRecord.id}
              href={`/cases/${caseRecord.id}`}
              className="case-table-row"
            >
              <span className="case-identity">
                <i>{caseRecord.legal_business_name.charAt(0)}</i>
                <span>
                  <strong>{caseRecord.legal_business_name}</strong>
                  <small>{caseRecord.reference} · {caseRecord.jurisdiction}</small>
                </span>
              </span>
              <span className="case-money">
                <strong>{money(caseRecord.requested_amount, caseRecord.currency)}</strong>
                <small>{caseRecord.industry}</small>
              </span>
              <span className="score-cell">
                <span><i style={{ width: `${caseRecord.completeness_score}%` }} /></span>
                <strong>{caseRecord.completeness_score}%</strong>
              </span>
              <StageBadge stage={caseRecord.stage} />
              <ArrowRight className="row-arrow" size={17} />
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-lower">
        <div>
          <div className="section-heading">
            <div>
              <h2>Recent ledger activity</h2>
              <p>Latest append-only events across the workspace.</p>
            </div>
          </div>
          <div className="activity-list">
            {summary.recent_activity.slice(0, 6).map((event) => (
              <div key={event.id} className="activity-row">
                <i className={`actor-dot actor-${event.actor_type}`} />
                <div>
                  <strong>{event.summary}</strong>
                  <span>{sentenceCase(event.actor_type)} · {relativeTime(event.created_at)}</span>
                </div>
                <code>{event.event_type}</code>
              </div>
            ))}
          </div>
        </div>

        <aside className="exceptions-panel">
          <span className="mono-label">Exception register</span>
          <h2>What is holding work</h2>
          <p>Open deterministic findings across the current queue.</p>
          <div className="failure-list">
            {summary.top_failure_reasons.map((reason, index) => (
              <div key={reason.rule_code}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{sentenceCase(reason.rule_code)}</strong>
                <b>{reason.count}</b>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
