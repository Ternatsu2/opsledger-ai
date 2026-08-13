"use client";

import { ErrorState } from "@/components/states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-pad">
      <ErrorState onRetry={reset} />
    </div>
  );
}
