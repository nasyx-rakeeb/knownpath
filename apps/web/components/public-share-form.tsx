"use client";

import type { KnownPathDetailResponse } from "@knownpath/domain";
import { useState, type FormEvent } from "react";

import { clientJson } from "../lib/client-api";
import { StatusBadge } from "./page-heading";

export function PublicShareForm({ path }: { path: KnownPathDetailResponse }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ status: "submitted" | "quarantined" }>();
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      const response = await clientJson<{ status: "submitted" | "quarantined" }>(
        `known-paths/${path.id}/share-public`,
        {
          method: "POST",
          body: JSON.stringify({
            consent: { policyVersion: 1, confirmed: true },
            payload: {
              problem: data.get("problem"),
              ecosystem: path.applicability.ecosystem,
              packages: path.applicability.packages.map((item) => ({
                ecosystem: path.applicability.ecosystem,
                name: item.name,
                ...(item.version === undefined ? {} : { version: item.version }),
              })),
              platforms: path.applicability.platforms,
              versions: path.applicability.versions,
              toolchain: [],
              symptoms: path.symptoms.map((item) => item.summary),
              errors: path.errors.map((item) => item.normalized),
              solutionSummary: data.get("solutionSummary"),
              steps:
                path.solutions[0]?.steps.map((step) => ({
                  instruction: step.instruction,
                  ...(step.verification === undefined ? {} : { verification: step.verification }),
                })) ?? [],
              caveats: path.solutions.flatMap((solution) => solution.caveats),
              successEvidence: {
                summary: data.get("successEvidence"),
                checks: [String(data.get("successEvidence"))],
              },
              consultedKnownPaths: [{ knownPathId: path.id, influence: "materially_applied" }],
            },
          }),
        },
      );
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Public share failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="section-block share-public">
      <p className="eyebrow">Explicit public promotion</p>
      <h2>Share a generalized public lesson</h2>
      <p className="section-copy">
        This creates a new sanitized public contribution. It never changes or publishes the
        private/workspace record itself. Review the generalized fields and remove proprietary
        details before consenting.
      </p>
      {result === undefined ? (
        <form className="stack-form" onSubmit={submit}>
          <label>
            Generalized problem
            <textarea
              defaultValue={path.problemSummary}
              maxLength={3000}
              name="problem"
              rows={3}
              required
            />
          </label>
          <label>
            Generalized solution
            <textarea
              defaultValue={path.solutions[0]?.summary ?? ""}
              maxLength={3000}
              name="solutionSummary"
              rows={3}
              required
            />
          </label>
          <label>
            Non-sensitive observable success evidence
            <textarea maxLength={2000} name="successEvidence" required rows={2} />
          </label>
          <label className="check-row">
            <input name="consent" required type="checkbox" />
            <span>
              I explicitly consent to submit these reviewed generalized fields for possible public
              publication.
            </span>
          </label>
          <button className="button" disabled={pending}>
            Submit sanitized public contribution
          </button>
          {error === undefined ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="scope-note">
          <StatusBadge tone={result.status === "submitted" ? "good" : "warn"}>
            {result.status}
          </StatusBadge>
          <p>
            {result.status === "submitted"
              ? "The distinct public contribution entered normal low-trust processing."
              : "Sanitization quarantined the request for review; the source remains private."}
          </p>
        </div>
      )}
    </section>
  );
}
