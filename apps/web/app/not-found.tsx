import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">404</p>
        <h1>Path not found</h1>
        <p>The requested record does not exist or is not visible to this account.</p>
        <Link className="button" href="/app/explore">
          Explore KnownPaths
        </Link>
      </section>
    </main>
  );
}
