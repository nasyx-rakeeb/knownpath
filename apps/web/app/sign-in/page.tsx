import Link from "next/link";
import { SignInForm } from "../../components/sign-in-form";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <Link className="wordmark auth-wordmark" href="/">
        KnownPath
      </Link>
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <p className="eyebrow">Developer account</p>
        <h1 id="sign-in-title">Sign in to KnownPath</h1>
        <p>Manage agent access, inspect shared knowledge, and control contribution privacy.</p>
        <SignInForm />
        <p className="auth-footnote">
          Registration remains closed. Accounts are created by an administrator.
        </p>
      </section>
    </main>
  );
}
