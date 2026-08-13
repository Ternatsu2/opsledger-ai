import {
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  FilePlus,
  MagnifyingGlass,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { StageBadge } from "@/components/stage-badge";
import { apiFetch } from "@/lib/api";
import { documentProgress, money } from "@/lib/format";
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
          <div className="page-kicker">Today</div>
          <h1 className="page-title">
            {summary.open_cases} application{summary.open_cases === 1 ? "" : "s"} open
          </h1>
          <p className="page-lead">Open an application to see what it needs.</p>
        </div>
        <Link href="/cases/new" className="button button-primary">
          <FilePlus size={17} /> Add application
        </Link>
      </header>

      <section className="queue-overview" aria-labelledby="queue-title">
        <div className="queue-number">
          <span className="mono-label" id="queue-title">Open applications</span>
          <strong>{summary.open_cases.toString().padStart(2, "0")}</strong>
          <p>
            {summary.ready_for_review} ready to review. {attentionCount} need follow-up.
          </p>
          <Link href="/cases" className="text-link">
            View all applications <ArrowRight size={14} />
          </Link>
        </div>

        <div className="queue-breakdown">
          <div>
            <span><CheckCircle size={18} /> Ready</span>
            <strong>{summary.ready_for_review}</strong>
          </div>
          <div>
            <span><ClockCountdown size={18} /> Waiting for information</span>
            <strong>{summary.needs_information}</strong>
          </div>
          <div>
            <span><MagnifyingGlass size={18} /> Needs a closer look</span>
            <strong>{summary.manual_investigation}</strong>
          </div>
          <div>
            <span><SealCheck size={18} /> Approved</span>
            <strong>{summary.approved}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>Applications</h2>
            <p>Start with one that needs attention.</p>
          </div>
          <Link href="/cases" className="button button-secondary">View all</Link>
        </div>

        <div className="case-table panel">
          <div className="case-table-head" aria-hidden="true">
            <span>Business</span>
            <span>Amount requested</span>
            <span>Documents</span>
            <span>Status</span>
            <span />
          </div>
          {cases.slice(0, 5).map((caseRecord) => {
            const { received, required } = documentProgress(caseRecord.completeness_breakdown);
            return (
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
                <span className="document-count-cell">
                  <strong>{received} of {required}</strong>
                  <small>received</small>
                </span>
                <StageBadge stage={caseRecord.stage} />
                <ArrowRight className="row-arrow" size={17} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
