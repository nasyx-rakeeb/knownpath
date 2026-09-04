import Link from "next/link";

import { SignUpForm } from "../../components/sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  const requestedReturn = (await searchParams).returnTo;
  const returnTo =
    requestedReturn?.startsWith("/") === true && !requestedReturn.startsWith("//")
      ? requestedReturn
      : "/app";
  return (
    <main className="auth-page">
      <Link className="wordmark auth-wordmark" href="/">
        KnownPath
      </Link>
      <section className="auth-panel" aria-labelledby="sign-up-title">
        <p className="eyebrow">Developer account</p>
        <h1 id="sign-up-title">Create your KnownPath account</h1>
        <p>Connect coding agents to evidence-grounded shared technical knowledge.</p>
        <SignUpForm returnTo={returnTo} />
        <p className="auth-footnote">
          Already have an account?{" "}
          <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
