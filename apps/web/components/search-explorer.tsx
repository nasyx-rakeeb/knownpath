"use client";
import { knowledgeSearchResponseSchema, type KnowledgeSearchResponse } from "@knownpath/domain";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { clientJson } from "../lib/client-api";
import { words } from "../lib/format";
import { StatusBadge } from "./page-heading";

export function SearchExplorer() {
  const [result, setResult] = useState<KnowledgeSearchResponse>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const response = await clientJson<unknown>("knowledge/search", {
        method: "POST",
        body: JSON.stringify({
          text: data.get("text"),
          errors: split(data.get("errors")),
          ecosystem: optional(data.get("ecosystem")),
          packages: split(data.get("packages")),
          versions: [],
          platforms: split(data.get("platforms")),
          environment: [],
          context: String(data.get("context") ?? ""),
          semanticMode: "optional",
          limit: 10,
          minimumScore: 35,
          includeReview: false,
        }),
      });
      setResult(knowledgeSearchResponseSchema.parse(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="explore-layout">
      <form className="search-form" onSubmit={submit}>
        <label className="full-field">
          Problem or task
          <textarea
            name="text"
            placeholder="Describe the error or difficult task…"
            required
            rows={5}
          />
        </label>
        <label>
          Error messages
          <textarea name="errors" placeholder="One error per line" rows={3} />
        </label>
        <label>
          Packages
          <input name="packages" placeholder="expo, react-native" />
        </label>
        <label>
          Ecosystem
          <input name="ecosystem" placeholder="expo" />
        </label>
        <label>
          Platforms
          <input name="platforms" placeholder="android, eas-build" />
        </label>
        <label className="full-field">
          Additional non-sensitive context
          <textarea name="context" rows={3} />
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Searching…" : "Search KnownPath"}
        </button>
        {error === undefined ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <section aria-live="polite" className="search-results">
        {result === undefined ? (
          <div className="search-placeholder">
            <p className="eyebrow">Retrieval guidance</p>
            <h2>Include the details that change the answer.</h2>
            <p>
              Exact errors, package names, platform, and framework version help KnownPath prefer
              compatible evidence over vague similarity.
            </p>
          </div>
        ) : (
          <>
            <div className="section-heading">
              <h2>
                {result.results.length} ranked result{result.results.length === 1 ? "" : "s"}
              </h2>
              <StatusBadge tone={result.capabilities.semantic.state === "used" ? "good" : "warn"}>
                semantic {result.capabilities.semantic.state}
              </StatusBadge>
            </div>
            {result.results.length === 0 ? (
              <div className="empty-state">
                <h2>No compatible path found</h2>
                <p>
                  Try adding an exact error, package, or version. KnownPath will not invent a match.
                </p>
              </div>
            ) : (
              result.results.map((item) => (
                <article className="result-row" key={item.id}>
                  <div className="result-title">
                    <StatusBadge
                      tone={
                        item.trust.grade === "high" || item.trust.grade === "very_high"
                          ? "good"
                          : "neutral"
                      }
                    >
                      {words(item.trust.grade)} trust
                    </StatusBadge>
                    <span>{item.relevance.score}/100 match</span>
                  </div>
                  <h3>
                    <Link href={`/app/known-paths/${item.id}`}>{item.title}</Link>
                  </h3>
                  <p>{item.solutionSummary}</p>
                  <div className="result-meta">
                    <span>{item.applicability.ecosystem}</span>
                    <span>{words(item.relevance.versionCompatibility)}</span>
                    <span>{words(item.freshness.status)}</span>
                  </div>
                  <p className="reason">{item.relevance.explanations[0]}</p>
                </article>
              ))
            )}
          </>
        )}
      </section>
    </div>
  );
}
function split(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
function optional(value: FormDataEntryValue | null): string | undefined {
  const result = String(value ?? "").trim();
  return result === "" ? undefined : result;
}
