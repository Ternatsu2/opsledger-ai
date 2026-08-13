import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <div className="page-pad">
      <EmptyState
        title="That record is not here"
        detail="The link may be out of date, or the case is outside this workspace."
        actionHref="/cases"
        actionLabel="Return to cases"
      />
    </div>
  );
}
