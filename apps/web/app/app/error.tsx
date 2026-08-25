"use client";
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="empty-state">
      <p className="eyebrow">Request failed</p>
      <h2>The dashboard could not load this view.</h2>
      <p>
        Check the KnownPath API connection and try again. Sensitive request details are not shown
        here.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
