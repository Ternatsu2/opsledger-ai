import { ArrowClockwise, FolderOpen, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-shell" role="status">
      <div className="loading-mark" aria-hidden="true"><i /><i /><i /></div>
      <strong>{label}</strong>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  actionHref,
  actionLabel,
}: {
  title: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="state-shell state-compact">
      <FolderOpen size={28} weight="duotone" />
      <strong>{title}</strong>
      <span>{detail}</span>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="button button-secondary">{actionLabel}</Link>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this page",
  detail = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-shell state-error" role="alert">
      <WarningCircle size={28} weight="duotone" />
      <strong>{title}</strong>
      <span>{detail}</span>
      {onRetry ? (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          <ArrowClockwise size={16} /> Try again
        </button>
      ) : null}
    </div>
  );
}
