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
import { documentProgress, issueLabel, money, relativeTime } from "@/lib/format";
import type { CaseListRecord, CaseStage } from "@/lib/types";

const filters: Array<{ value: "ALL" | CaseStage; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "READY_FOR_HUMAN_REVIEW", label: "Ready for review" },
  { value: "NEEDS_INFORMATION", label: "More information needed" },
  { value: "MANUAL_INVESTIGATION", label: "Needs a closer look" },
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
      setError(caught instanceof Error ? caught.message : "We couldn't load the applications.");
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
    return <PageLoading label="Loading applications" />;
  }

  const ready = cases.filter((item) => item.stage === "READY_FOR_HUMAN_REVIEW").length;
  const held = cases.filter((item) => item.stage === "MANUAL_INVESTIGATION").length;
  const issueFilters = [...new Set(cases.flatMap((item) => item.issue_codes))].sort();

  return (
    <div className="page-pad cases-page">
      <header className="page-header-row cases-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-lead">Search by business, application number, or registration.</p>
        </div>
        <Link href="/cases/new" className="button button-primary">
          <FilePlus size={17} /> Add application
        </Link>
      </header>

      <div className="queue-stats" aria-label="Queue summary">
        <div><span>All applications</span><strong>{cases.length}</strong></div>
        <div><span>Ready to review</span><strong>{ready}</strong></div>
        <div><span>Need a closer look</span><strong>{held}</strong></div>
      </div>

      <section className="register-section">
        <div className="register-tools">
          <label className="search-field">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search applications"
              aria-label="Search applications"
            />
          </label>
          <label className="filter-field">
            <FunnelSimple size={16} aria-hidden="true" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as "ALL" | CaseStage)}
              aria-label="Filter by status"
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
              aria-label="Filter by issue"
            >
              <option value="ALL">All issues</option>
              {issueFilters.map((issue) => (
                <option key={issue} value={issue}>{issueLabel(issue)}</option>
              ))}
            </select>
          </label>
          <span className="result-count">{visibleCases.length} result{visibleCases.length === 1 ? "" : "s"}</span>
        </div>

        {visibleCases.length ? (
          <div className="register-table panel">
            <div className="register-head" aria-hidden="true">
              <span>Business</span>
              <span>Amount requested</span>
              <span>Documents</span>
              <span>Needs attention</span>
              <span>Status</span>
              <span>Reviewer</span>
              <span />
            </div>
            {visibleCases.map((caseRecord) => {
              const { received, required } = documentProgress(caseRecord.completeness_breakdown);
              return (
                <Link
                  key={caseRecord.id}
                  href={`/cases/${caseRecord.id}`}
                  className="register-row"
                >
                  <span className="register-business">
                    <i>{caseRecord.legal_business_name.charAt(0)}</i>
                    <span>
                      <strong>{caseRecord.legal_business_name}</strong>
                      <small>{caseRecord.reference} · added {relativeTime(caseRecord.created_at)}</small>
                    </span>
                  </span>
                  <span className="register-request">
                    <strong>{money(caseRecord.requested_amount, caseRecord.currency)}</strong>
                    <small>{caseRecord.funding_purpose}</small>
                  </span>
                  <span className="register-documents">
                    <strong>{received} of {required}</strong>
                    <small>received</small>
                  </span>
                  <span className={`register-issues ${caseRecord.open_finding_count ? "has-issues" : ""}`}>
                    <strong>{caseRecord.issue_codes.length ? issueLabel(caseRecord.issue_codes[0]) : "No issues"}</strong>
                    {caseRecord.issue_codes.length > 1 ? <small>+{caseRecord.issue_codes.length - 1} more</small> : null}
                  </span>
                  <StageBadge stage={caseRecord.stage} />
                  <span className="register-reviewer">{caseRecord.assigned_reviewer_id ?? "Unassigned"}</span>
                  <ArrowRight className="row-arrow" size={17} />
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No applications found"
            detail="Try another search or filter."
          />
        )}
      </section>
    </div>
  );
}
