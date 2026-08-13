export type CaseStage =
  | "DRAFT"
  | "SUBMITTED"
  | "INGESTING"
  | "EXTRACTION_FAILED"
  | "VALIDATING"
  | "NEEDS_INFORMATION"
  | "AGENT_REVIEW"
  | "READY_FOR_HUMAN_REVIEW"
  | "MANUAL_INVESTIGATION"
  | "APPROVED_FOR_NEXT_STAGE"
  | "CLOSED";

export interface CaseRecord {
  id: string;
  reference: string;
  legal_business_name: string;
  trading_name: string | null;
  registration_number: string;
  jurisdiction: string;
  industry: string;
  requested_amount: string;
  currency: string;
  funding_purpose: string;
  annual_revenue: string;
  contact_name: string;
  contact_email: string;
  stage: CaseStage;
  completeness_score: number;
  completeness_breakdown: Array<{
    code: string;
    label: string;
    weight: number;
    complete: boolean;
  }>;
  assigned_reviewer_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CaseListRecord extends CaseRecord {
  open_finding_count: number;
  issue_codes: string[];
  last_action: string | null;
}

export interface EvidenceDocument {
  id: string;
  case_id: string;
  original_filename: string;
  document_type: string;
  mime_type: string;
  sha256: string;
  upload_status: string;
  extraction_status: string;
  page_count: number | null;
  metadata_json: Record<string, unknown>;
  uploaded_at: string;
  extracted_at: string | null;
  error_code: string | null;
  error_message_safe: string | null;
}

export interface ExtractedField {
  id: string;
  document_id: string;
  field_name: string;
  normalized_value: unknown;
  raw_value: string;
  confidence: number;
  source_page: number | null;
  source_locator: string;
  extraction_method: string;
  verified_by_human: boolean;
}

export interface Finding {
  id: string;
  rule_code: string;
  severity: string;
  status: string;
  message: string;
  evidence_json: Array<Record<string, unknown>>;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
}

export interface EvidenceCitation {
  citation_id: string;
  label: string;
  claim: string;
}

export interface AgentOutput {
  case_summary: string;
  evidence_summary: EvidenceCitation[];
  unresolved_findings: Array<{ finding_id: string; explanation: string }>;
  missing_information: Array<{ item: string; rule_code: string; reason: string }>;
  recommended_action: CaseStage;
  recommendation_reason: string;
  follow_up_draft: string | null;
  limitations: string[];
}

export interface AgentRun {
  id: string;
  workflow_name: string;
  model_provider: string;
  model_name: string;
  prompt_version: string;
  tool_calls_json: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result_count: number;
  }>;
  structured_output_json: AgentOutput | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  token_usage: Record<string, unknown>;
  latency_ms: number | null;
  error_code: string | null;
}

export interface ReviewAction {
  id: string;
  reviewer_id: string;
  action_type: string;
  edited_draft: string | null;
  rationale: string;
  prior_stage: string;
  resulting_stage: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  case_id: string | null;
  correlation_id: string;
  actor_type: string;
  actor_id: string;
  event_type: string;
  summary: string;
  prior_state_json: Record<string, unknown>;
  new_state_json: Record<string, unknown>;
  created_at: string;
}

export interface CaseDetail extends CaseRecord {
  documents: EvidenceDocument[];
  extracted_fields: ExtractedField[];
  findings: Finding[];
  agent_runs: AgentRun[];
  review_actions: ReviewAction[];
  audit_events: AuditEvent[];
}

export interface DashboardSummary {
  open_cases: number;
  ready_for_review: number;
  needs_information: number;
  manual_investigation: number;
  approved: number;
  average_processing_seconds: number | null;
  top_failure_reasons: Array<{ rule_code: string; count: number }>;
  recent_activity: AuditEvent[];
}

export interface SystemStatus {
  demo_mode: boolean;
  synthetic_data_only: boolean;
  policy_version: string;
  model_provider: string;
  model: string;
  human_approval_required: boolean;
  follow_up_auto_send: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  correlation_id: string;
  details?: { fields?: Array<{ path: string; message: string }> };
}
