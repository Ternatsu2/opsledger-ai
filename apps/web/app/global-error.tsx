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
              Your application data has not been changed. Try loading the workspace again. If it
              still does not work, ask your support contact for help.
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
