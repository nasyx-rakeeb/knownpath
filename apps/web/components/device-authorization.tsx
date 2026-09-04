"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readApiError } from "../lib/client-api";

interface DeviceGrant {
  readonly client_id?: string;
  readonly scope?: string;
  readonly status: "approved" | "denied" | "pending";
  readonly user_code: string;
}

export function DeviceAuthorization({ userCode }: { readonly userCode: string }) {
  const router = useRouter();
  const [grant, setGrant] = useState<DeviceGrant>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const returnTo = `/device?user_code=${encodeURIComponent(userCode)}`;
    fetch(`/api/knownpath/auth/device?user_code=${encodeURIComponent(userCode)}`)
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        if (!response.ok) throw new Error(await readApiError(response));
        setGrant((await response.json()) as DeviceGrant);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Authorization request failed"),
      );
  }, [router, userCode]);

  async function decide(action: "approve" | "deny") {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/knownpath/auth/device/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setGrant((current) =>
        current === undefined
          ? current
          : { ...current, status: action === "approve" ? "approved" : "denied" },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization decision failed");
    } finally {
      setPending(false);
    }
  }

  if (error !== undefined)
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  if (grant === undefined) return <p aria-live="polite">Loading authorization request…</p>;
  if (grant.status !== "pending") {
    return (
      <p className="success-message">
        This request was {grant.status}. You may return to your terminal.
      </p>
    );
  }
  return (
    <div className="form-stack">
      <div className="device-code" aria-label="Authorization code">
        {grant.user_code}
      </div>
      <p>
        <strong>KnownPath CLI</strong> is requesting access to search knowledge and submit
        consent-gated contributions and outcomes.
      </p>
      <p className="auth-footnote">
        Only approve if this code matches the terminal you started. The CLI receives a separate
        revocable machine credential, not your browser session.
      </p>
      <div className="button-row">
        <button
          className="button"
          disabled={pending}
          onClick={() => void decide("approve")}
          type="button"
        >
          Approve
        </button>
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => void decide("deny")}
          type="button"
        >
          Deny
        </button>
      </div>
      <Link href="/app/api-keys">Review active credentials</Link>
    </div>
  );
}
