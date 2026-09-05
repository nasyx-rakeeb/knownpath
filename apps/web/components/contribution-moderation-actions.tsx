"use client";

import { useState } from "react";

export function ContributionModerationActions({
  contributionId,
  moderationStatus,
}: {
  contributionId: string;
  moderationStatus: string;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function apply(action: "approve" | "reject") {
    const operation = `moderation.${action}`;
    const phrase = `CONFIRM ${operation} ${contributionId}`;
    const entered = window.prompt(`Type this exact phrase to ${action}:\n\n${phrase}`);
    if (entered !== phrase) {
      setMessage("Confirmation did not match; nothing changed.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/knownpath/admin/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resource: "contribution",
          id: contributionId,
          action,
          expectedStatus: moderationStatus,
          confirmation: { version: 1, action: operation, target: contributionId, reason, phrase },
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Moderation failed");
      setMessage(
        action === "approve"
          ? "Approved. Durable canonicalization has been scheduled."
          : "Rejected. No canonicalization was scheduled.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Moderation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="control-form" aria-labelledby="contribution-moderation-heading">
      <h2 id="contribution-moderation-heading">Moderate contribution</h2>
      <p>
        Approval preserves weak self-report trust and schedules normal canonicalization. Publication
        remains a separate manual decision.
      </p>
      <label>
        Required moderation reason
        <textarea
          maxLength={2000}
          minLength={8}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <div className="row-actions">
        <button
          className="button"
          disabled={pending || reason.trim().length < 8}
          onClick={() => void apply("approve")}
          type="button"
        >
          Approve and process
        </button>
        <button
          className="danger-button"
          disabled={pending || reason.trim().length < 8}
          onClick={() => void apply("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
