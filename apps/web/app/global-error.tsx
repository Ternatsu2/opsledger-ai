"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="route-state-page">
          <section className="route-state-card">
            <p className="eyebrow">OpsLedger AI</p>
            <h1>The workspace could not load.</h1>
            <p>
              Your case data has not been changed. Try loading the workspace again; if the issue
              continues, use the correlation ID from the API response when reporting it.
            </p>
            <button className="button primary" type="button" onClick={reset}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
