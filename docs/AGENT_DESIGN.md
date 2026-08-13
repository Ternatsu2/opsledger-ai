# Agent design

## Objective

The agent reduces the time a reviewer spends reading an already-validated case. It explains the package, cites evidence, lists unresolved items, and proposes one of three workflow routes. It does not decide whether a business deserves financing.

## Bounded context tools

`collect_agent_context` executes five typed, read-only lookups before the model call:

| Tool record | Returned data | Write access |
| --- | --- | --- |
| `get_case` | Intake values and per-field citation IDs | None |
| `get_extracted_fields` | Normalized/raw fields, source locator, document ID | None |
| `get_validation_findings` | Rule code, severity, message, cited evidence | None |
| `get_document_evidence` | Document type, name, extraction state, parsed metadata | None |
| `retrieve_demo_policy` | Versioned synthetic readiness policy | None |

The low tool count is deliberate. There is no recursive planner, shell access, network retrieval, arbitrary SQL, or document mutation. Saving a validated recommendation happens in application code after the model returns.

## Provider contract

The provider abstraction supports:

- `codex_luna` — local Codex CLI using `gpt-5.6-luna`, `xhigh`, an ephemeral directory, and a read-only sandbox;
- `auto` — try local Codex and use the deterministic fallback if it is unavailable or invalid;
- `deterministic` — produce the same schema from trusted case/rule data without a model call.

The Railway image uses `deterministic` because a user-authenticated local Codex session is not present inside the hosted container. Reviewers can inspect `model_provider` and `model_name` on every stored run; fallback is never represented as a Luna result.

## Structured output

Every response must include:

- `case_summary`
- `evidence_summary[]` with an exact `citation_id`
- `unresolved_findings[]` with an existing finding ID
- `missing_information[]` with a rule code
- `recommended_action`
- `recommendation_reason`
- nullable `follow_up_draft`
- `limitations[]`

All objects set `additionalProperties: false`. Pydantic enforces lengths and the three-value action enum. The application separately checks that citations exist, finding IDs exist, and the model’s action equals the route already selected by deterministic code.

## Orchestration

```mermaid
sequenceDiagram
  participant S as Review service
  participant D as Database
  participant M as Local model / fallback
  participant H as Human reviewer
  S->>D: Load case, fields, findings, documents, policy
  S->>M: Strict schema + five typed results
  M-->>S: Structured recommendation
  S->>S: Validate schema, citations, IDs, route
  alt Invalid and first attempt
    S->>M: One repair prompt with validation errors
    M-->>S: Corrected structured recommendation
  else Invalid after second attempt
    S->>D: Mark run failed; no workflow approval
  end
  S->>D: Save valid output and audit event
  D-->>H: Present evidence and proposed route
  H->>S: Rationale + approve/edit/route action
  S->>D: Apply allowed transition and append audit event
```

Maximum model attempts are two. The context uses five tool records and has a hard demonstration ceiling of eight. The subprocess timeout defaults to 120 seconds.

## Human boundary

The agent cannot:

- approve or reject financing;
- mark a business eligible;
- resolve an identity conflict;
- send the follow-up draft;
- transfer funds;
- close a case;
- bypass an allowed transition.

The UI describes agent text as a recommendation. Consequential controls open a confirmation dialog and require a reviewer rationale. Case B deliberately exposes no send button. Review actions, including edits that do not change state, are recorded with the reviewer identifier.

## Stored observability

An `agent_runs` record stores the input hash, prompt version, provider/model identity, five tool-call summaries, structured output, status, token usage when available, latency, and safe error code. It does not store hidden chain-of-thought. Audit history stores the resulting reviewer-facing event and correlation ID.

## Verified local provider run

On 2026-08-13 AST, a strict `gpt-5.6-luna` release refresh completed for all three cases. Every run used five context tools and preserved the route selected by code. Case A completed in 22,130 ms with 12 citations; Case B in 26,623 ms with five citations and the required editable draft; Case C in 54,918 ms with six citations and a null draft. These are local integration measurements, not latency guarantees.
