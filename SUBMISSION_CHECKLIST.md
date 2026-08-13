# OpsLedger AI Submission Checklist

## Access

- [ ] Terry confirms selected-team portal access.
- [x] Public deadline checked against the current Submission Guidelines.
- [ ] Organizer confirms the controlling deadline and submission route.
- [ ] Final submission URL saved.

## Product

- [ ] Public deployment opens without private setup.
- [x] Case A reaches Ready for Human Review and supports a human approval.
- [x] Case B reaches Needs Information and produces an editable draft.
- [x] Case C reaches Manual Investigation and shows duplicate evidence.
- [x] Deterministic findings match the seeded expectations.
- [x] Agent output passes schema and citation validation.
- [x] Audit events cover each state change and reviewer action.
- [x] Failure and retry states work.
- [x] Case packet download works.

## Code and security

- [x] Personal public GitHub repository created: `Ternatsu2/opsledger-ai`.
- [x] Apache-2.0 license present.
- [x] README setup and verification commands documented.
- [x] `.env.example` contains variable names and safe examples only.
- [x] Secret scan passes for the intended text source scope.
- [x] Dependency scan reviewed: npm audit reports zero known vulnerabilities.
- [x] No former client names or private assets appear in the intended tracked scope.

## Documentation

- [x] One- to two-page overview complete.
- [x] Architecture and bounded agent workflow documented.
- [x] Models, tools, and synthetic data disclosed.
- [x] Responsible AI statement contains 300 to 500 words.
- [x] Testing evidence records measured results.
- [x] Business model, go-to-market plan, and limitations complete.

## Demo and final portal

- [ ] Three- to five-minute demo recorded.
- [x] Demo script covers all three cases, human control, and the audit trail.
- [x] Written claims match measured behavior.
- [ ] Repository, deployment, and demo links work while signed out.
- [ ] Terry reviews the exact package.
- [ ] Final submission sent only after Terry’s approval.
- [ ] Submission receipt captured.
