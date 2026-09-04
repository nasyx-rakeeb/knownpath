"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { readApiError } from "../lib/client-api";

export function SignUpForm({ returnTo = "/app" }: { readonly returnTo?: string }) {
  const router = useRouter();
  const [registration, setRegistration] = useState<"checking" | "closed" | "open">("checking");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void fetch("/api/knownpath/auth/registration", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        return (await response.json()) as { registration: "closed" | "open" };
      })
      .then((result) => {
        if (active) setRegistration(result.registration);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Registration check failed");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirmPassword") ?? "")) {
      setError("Passwords do not match");
      setPending(false);
      return;
    }
    try {
      const response = await fetch("/api/knownpath/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          name: data.get("name"),
          password,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      router.replace(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account creation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      {registration === "closed" ? (
        <p className="form-error" role="status">
          Registration is closed on this KnownPath deployment. Ask its operator to create your
          account, then sign in to authorize this device.
        </p>
      ) : null}
      <label>
        Name
        <input autoComplete="name" name="name" required maxLength={256} />
      </label>
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Password
        <input
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </label>
      <label>
        Confirm password
        <input
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={pending || registration !== "open"} type="submit">
        {registration === "checking"
          ? "Checking registration…"
          : pending
            ? "Creating account…"
            : "Create account"}
      </button>
    </form>
  );
}
