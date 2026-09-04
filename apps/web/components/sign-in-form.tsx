"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { readApiError } from "../lib/client-api";

export function SignInForm({ returnTo = "/app" }: { readonly returnTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/knownpath/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      router.replace(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Password
        <input
          autoComplete="current-password"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
