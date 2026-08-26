"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";

import { adminCanonicalPreviewResponseSchema } from "../lib/contracts";

type Action = "merge" | "split" | "reassign";

export function CanonicalControls() {
  const [action, setAction] = useState<Action>("merge");
  const [candidateText, setCandidateText] = useState("");
  const [targetKnownPathId, setTargetKnownPathId] = useState("");
  const [alternativeSolution, setAlternativeSolution] = useState(false);
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [preview, setPreview] =
    useState<ReturnType<typeof adminCanonicalPreviewResponseSchema.parse>>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const candidateIds = candidateText
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const previewBody =
    action === "merge"
      ? {
          action,
          candidateIds,
          ...(targetKnownPathId ? { targetKnownPathId } : {}),
          alternativeSolution,
        }
      : action === "split"
        ? { action, candidateId: candidateIds[0] ?? "" }
        : { action, candidateId: candidateIds[0] ?? "", targetKnownPathId };
  const sensitiveAction = `canonical.${action}`;
  const expectedPhrase = preview ? `CONFIRM ${sensitiveAction} ${preview.previewDigest}` : "";

  async function createPreview() {
    setPending(true);
    setMessage("");
    setPreview(undefined);
    try {
      const response = await fetch("/api/knownpath/admin/canonicalization/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(previewBody),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      setPreview(adminCanonicalPreviewResponseSchema.parse(body));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPending(false);
    }
  }

  async function execute() {
    if (!preview) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/knownpath/admin/canonicalization/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preview: previewBody,
          previewDigest: preview.previewDigest,
          confirmation: {
            version: 1,
            action: sensitiveAction,
            target: preview.previewDigest,
            reason,
            phrase,
          },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      setMessage(`${sensitiveAction} completed with immutable operator history.`);
      setPreview(undefined);
      setPhrase("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Canonicalization failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="canonical-control">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reversible canonicalization</p>
          <h2>Merge, split, or reassign candidates</h2>
        </div>
        <span className="badge badge-warn">Preview required</span>
      </div>
      <div className="canonical-form">
        <label>
          Operation
          <select
            onChange={(event) => {
              setAction(event.target.value as Action);
              setPreview(undefined);
            }}
            value={action}
          >
            <option value="merge">Merge candidate(s)</option>
            <option value="split">Split candidate</option>
            <option value="reassign">Reassign candidate</option>
          </select>
        </label>
        <label>
          Candidate ID{action === "merge" ? "s" : ""}
          <textarea
            onChange={(event) => {
              setCandidateText(event.target.value);
              setPreview(undefined);
            }}
            placeholder={action === "merge" ? "One UUID per line" : "Candidate UUID"}
            value={candidateText}
          />
        </label>
        {action !== "split" ? (
          <label>
            Target KnownPath ID {action === "merge" ? "(optional)" : ""}
            <input
              onChange={(event) => {
                setTargetKnownPathId(event.target.value.trim());
                setPreview(undefined);
              }}
              value={targetKnownPathId}
            />
          </label>
        ) : null}
        {action === "merge" ? (
          <label className="check-field">
            <input
              checked={alternativeSolution}
              onChange={(event) => {
                setAlternativeSolution(event.target.checked);
                setPreview(undefined);
              }}
              type="checkbox"
            />{" "}
            Preserve as an alternative solution variant
          </label>
        ) : null}
        <label>
          Operator reason
          <textarea
            minLength={8}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </label>
        <button
          className="quiet-button"
          disabled={
            pending || candidateIds.length === 0 || (action === "reassign" && !targetKnownPathId)
          }
          onClick={createPreview}
          type="button"
        >
          {pending ? "Resolving…" : "Generate current-state preview"}
        </button>
      </div>
      {preview ? (
        <div className="canonical-preview">
          <h3>Resolved impact</h3>
          <dl>
            <div>
              <dt>Preview digest</dt>
              <dd>
                <code>{preview.previewDigest}</code>
              </dd>
            </div>
            <div>
              <dt>Candidates</dt>
              <dd>{preview.candidateIds.join(", ")}</dd>
            </div>
            <div>
              <dt>Affected KnownPaths</dt>
              <dd>
                {preview.affectedKnownPathIds.join(", ") || "A new review record may be created"}
              </dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{preview.expiresAt.toLocaleString()}</dd>
            </div>
          </dl>
          {preview.warnings.map((warning) => (
            <p className="form-warning" key={warning}>
              {warning}
            </p>
          ))}
          <AlertDialog.Root>
            <AlertDialog.Trigger asChild>
              <button className="danger-button" disabled={reason.trim().length < 8} type="button">
                Confirm resolved operation
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="dialog-overlay" />
              <AlertDialog.Content className="dialog-panel">
                <AlertDialog.Title>Execute {sensitiveAction}?</AlertDialog.Title>
                <AlertDialog.Description>
                  The backend will regenerate this preview. Any changed membership, status, or
                  moderation state invalidates the operation.
                </AlertDialog.Description>
                <label>
                  Type the exact phrase<code>{expectedPhrase}</code>
                  <input onChange={(event) => setPhrase(event.target.value)} value={phrase} />
                </label>
                <div className="row-actions">
                  <AlertDialog.Cancel asChild>
                    <button className="quiet-button">Cancel</button>
                  </AlertDialog.Cancel>
                  <button
                    className="danger-button"
                    disabled={pending || phrase !== expectedPhrase}
                    onClick={execute}
                    type="button"
                  >
                    Execute and audit
                  </button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      ) : null}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function apiMessage(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "Canonicalization request failed";
}
