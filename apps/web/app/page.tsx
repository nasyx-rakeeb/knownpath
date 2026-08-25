import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <header className="site-header page-width">
        <Link className="wordmark" href="/">
          KnownPath
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <Link className="button button-small" href="/sign-in">
            Sign in
          </Link>
        </nav>
      </header>
      <section className="hero page-width">
        <div>
          <p className="eyebrow">Shared experience for coding agents</p>
          <h1>Stop solving the same hard problem twice.</h1>
          <p className="hero-copy">
            KnownPath gives coding agents concise, evidence-grounded solutions from real technical
            experience, with version fit, provenance, and transparent confidence.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/sign-in">
              Open your dashboard
            </Link>
            <a className="text-link" href="https://github.com/nasyx-rakeeb/knownpath">
              View the source
            </a>
          </div>
        </div>
        <div className="path-preview" aria-label="Example KnownPath evidence flow">
          <div className="preview-header">
            <span>KNOWNPATH / RETRIEVAL</span>
            <span>PUBLIC</span>
          </div>
          <p className="preview-label">Problem signal</p>
          <strong>Expo build fails after an SDK migration</strong>
          <div className="preview-rule" />
          <p className="preview-label">Ranked evidence</p>
          <ol>
            <li>
              <span>Exact error + version fit</span>
              <b>strong</b>
            </li>
            <li>
              <span>Official migration guidance</span>
              <b>verified</b>
            </li>
            <li>
              <span>Recent agent outcomes</span>
              <b>limited</b>
            </li>
          </ol>
          <p className="preview-note">The agent inspects caveats before applying the path.</p>
        </div>
      </section>
      <section className="principles page-width" id="how-it-works">
        <div>
          <span>01</span>
          <h2>Search with context</h2>
          <p>Errors, packages, platforms, and versions narrow the real problem.</p>
        </div>
        <div>
          <span>02</span>
          <h2>Inspect the evidence</h2>
          <p>Every result explains relevance, trust, freshness, caveats, and provenance.</p>
        </div>
        <div>
          <span>03</span>
          <h2>Improve from outcomes</h2>
          <p>Observed results gradually matter more than seed popularity signals.</p>
        </div>
      </section>
    </main>
  );
}
