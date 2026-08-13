"use client";

import {
  ArrowRight,
  FilePlus,
  FunnelSimple,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StageBadge } from "@/components/stage-badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/states";
import { apiFetch } from "@/lib/api";
import { money, relativeTime, sentenceCase } from "@/lib/format";
import type { CaseListRecord, CaseStage } from "@/lib/types";

const filters: Array<{ value: "ALL" | CaseStage; label: string }> = [
  { value: "ALL", label: "All cases" },
  { value: "READY_FOR_HUMAN_REVIEW", label: "Ready for review" },
  { value: "NEEDS_INFORMATION", label: "Needs information" },
  { value: "MANUAL_INVESTIGATION", label: "Manual investigation" },
  { value: "APPROVED_FOR_NEXT_STAGE", label: "Approved" },
  { value: "DRAFT", label: "Draft" },
];

export default function CasesPage() {
  const [cases, setCases] = useState<CaseListRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | CaseStage>("ALL");
  const [issueFilter, setIssueFilter] = useState("ALL");

  const load = async () => {
    setError(null);
    try {
      setCases(await apiFetch<CaseListRecord[]>("/cases"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The case queue could not load.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleCases = useMemo(() => {
    if (!cases) return [];
    const term = query.trim().toLowerCase();
    return cases.filter((caseRecord) => {
      const matchesStage = filter === "ALL" || caseRecord.stage === filter;
      const matchesIssue =
        issueFilter === "ALL" || caseRecord.issue_codes.includes(issueFilter);
      const matchesTerm =
        !term ||
        [
          caseRecord.reference,
          caseRecord.legal_business_name,
          caseRecord.registration_number,
          caseRecord.jurisdiction,
        ].some((value) => value.toLowerCase().includes(term));
      return matchesStage && matchesIssue && matchesTerm;
    });
  }, [cases, filter, issueFilter, query]);

  if (error) {
    return <div className="page-pad"><ErrorState detail={error} onRetry={load} /></div>;
  }

  if (!cases) {
    return <PageLoading label="Loading case queue" />;
  }

  const ready = cases.filter((item) => item.stage === "READY_FOR_HUMAN_REVIEW").length;
  const held = cases.filter((item) => item.stage === "MANUAL_INVESTIGATION").length;
  const issueFilters = [...new Set(cases.flatMap((item) => item.issue_codes))].sort();

  return (
    <div className="page-pad cases-page">
      <header className="page-header-row cases-header">
        <div>
          <div className="page-kicker">Case operations</div>
          <h1 className="page-title">Financing-readiness queue</h1>
          <p className="page-lead">
            Search the full intake register, see why each case is routed, and open the
            underlying evidence before taking action.
          </p>
        </div>
        <Link href="/cases/new" className="button button-primary">
          <FilePlus size={17} /> New intake
        </Link>
      </header>

      <div className="queue-stats" aria-label="Queue summary">
        <div><span>Total register</span><strong>{cases.length}</strong></div>
        <div><span>Awaiting a person</span><strong>{ready}</strong></div>
        <div><span>Held for investigation</span><strong>{held}</strong></div>
        <p>Last synchronized just now · Synthetic demo workspace</p>
      </div>

      <section className="register-section">
        <div className="register-tools">
          <label className="search-field">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search business, case, or registration"
              aria-label="Search cases"
            />
          </label>
          <label className="filter-field">
            <FunnelSimple size={16} aria-hidden="true" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as "ALL" | CaseStage)}
              aria-label="Filter by workflow stage"
            >
              {filters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="filter-field issue-filter-field">
            <FunnelSimple size={16} aria-hidden="true" />
            <select
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.target.value)}
              aria-label="Filter by issue type"
            >
              <option value="ALL">All issue types</option>
              {issueFilters.map((issue) => (
                <option key={issue} value={issue}>{sentenceCase(issue)}</option>
              ))}
            </select>
          </label>
          <span className="result-count">{visibleCases.length} result{visibleCases.length === 1 ? "" : "s"}</span>
        </div>

        {visibleCases.length ? (
          <div className="register-table panel">
            <div className="register-head" aria-hidden="true">
              <span>Case / business</span>
              <span>Financing request</span>
              <span>Package</span>
              <span>Issues</span>
              <span>Current state</span>
              <span>Reviewer</span>
              <span>Last action</span>
              <span />
            </div>
            {visibleCases.map((caseRecord) => (
              <Link
                key={caseRecord.id}
                href={`/cases/${caseRecord.id}`}
                className="register-row"
              >
                <span className="register-business">
                  <i>{caseRecord.legal_business_name.charAt(0)}</i>
                  <span>
                    <strong>{caseRecord.legal_business_name}</strong>
                    <small>{caseRecord.reference} · submitted {relativeTime(caseRecord.created_at)}</small>
                  </span>
                </span>
                <span className="register-request">
                  <strong>{money(caseRecord.requested_amount, caseRecord.currency)}</strong>
                  <small>{caseRecord.funding_purpose}</small>
                </span>
                <span className="register-score">
                  <strong>{caseRecord.completeness_score}%</strong>
                  <span><i style={{ width: `${caseRecord.completeness_score}%` }} /></span>
                </span>
                <span className={`register-issues ${caseRecord.open_finding_count ? "has-issues" : ""}`}>
                  <strong>{caseRecord.open_finding_count}</strong>
                  <small>{caseRecord.issue_codes.length ? sentenceCase(caseRecord.issue_codes[0]) : "Clear"}</small>
                </span>
                <StageBadge stage={caseRecord.stage} />
                <span className="register-reviewer">{caseRecord.assigned_reviewer_id ?? "Unassigned"}</span>
                <span className="register-action">
                  <strong>{caseRecord.last_action ?? "Case created"}</strong>
                  <small>{relativeTime(caseRecord.updated_at)}</small>
                </span>
                <ArrowRight className="row-arrow" size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No cases match this view"
            detail="Clear the search or choose another workflow state."
          />
        )}
      </section>
    </div>
  );
}
