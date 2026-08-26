"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";

import { adminPrivateRevealResponseSchema } from "../lib/contracts";

export function PrivateContributionReveal({ contributionId }: { contributionId: string }) {
  const action = "private_content.reveal";
  const expected = `CONFIRM ${action} ${contributionId}`;
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [content, setContent] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function reveal() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/knownpath/admin/private-content/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contributionId,
          confirmation: { version: 1, action, target: contributionId, reason, phrase },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      const parsed = adminPrivateRevealResponseSchema.parse(body);
      setContent(parsed.sanitizedPayload);
      setPhrase("");
      setMessage("Sanitized private content revealed. This access is now in the audit history.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reveal failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="private-review-panel">
      <div>
        <p className="eyebrow">Restricted private content</p>
        <h2>Sanitized lesson is hidden</h2>
        <p>
          Only the sanitized structured contribution can be revealed. Original input and removed
          sensitive values are never returned.
        </p>
      </div>
      <AlertDialog.Root>
        <AlertDialog.Trigger asChild>
          <button className="danger-button" type="button">
            Request moderated reveal
          </button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-panel">
            <AlertDialog.Title>Reveal sanitized private content?</AlertDialog.Title>
            <AlertDialog.Description>
              This action requires a fresh administrator session, a reason, and exact confirmation.
              Every attempt is audited.
            </AlertDialog.Description>
            <label>
              Moderation or security reason
              <textarea
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </label>
            <label>
              Type the exact phrase<code>{expected}</code>
              <input onChange={(event) => setPhrase(event.target.value)} value={phrase} />
            </label>
            {message ? (
              <p className="form-message" role="status">
                {message}
              </p>
            ) : null}
            <div className="row-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button" type="button">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                className="danger-button"
                disabled={pending || reason.trim().length < 8 || phrase !== expected}
                onClick={reveal}
                type="button"
              >
                {pending ? "Checking…" : "Reveal and audit"}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {content !== undefined ? (
        <div className="private-content">
          <div className="section-heading">
            <h3>Sanitized structured lesson</h3>
            <button
              className="quiet-button button-small"
              onClick={() => setContent(undefined)}
              type="button"
            >
              Hide now
            </button>
          </div>
          <pre className="untrusted-content">{JSON.stringify(content, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}

function apiMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "The private contribution could not be revealed";
}
