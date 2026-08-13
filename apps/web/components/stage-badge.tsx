import type { CaseStage } from "@/lib/types";
import { sentenceCase } from "@/lib/format";

const tones: Record<CaseStage, string> = {
  DRAFT: "stage-neutral",
  SUBMITTED: "stage-neutral",
  INGESTING: "stage-progress",
  EXTRACTION_FAILED: "stage-danger",
  VALIDATING: "stage-progress",
  NEEDS_INFORMATION: "stage-warning",
  AGENT_REVIEW: "stage-progress",
  READY_FOR_HUMAN_REVIEW: "stage-ready",
  MANUAL_INVESTIGATION: "stage-danger",
  APPROVED_FOR_NEXT_STAGE: "stage-approved",
  CLOSED: "stage-neutral",
};

export function StageBadge({ stage }: { stage: CaseStage }) {
  return (
    <span className={`stage-badge ${tones[stage]}`}>
      <i aria-hidden="true" />
      {sentenceCase(stage)}
    </span>
  );
}
