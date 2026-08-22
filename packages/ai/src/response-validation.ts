import type { SourceItem } from "@knownpath/domain";

import { extractionOutputSchema, type ExtractionOutput } from "./output-schema.js";

export type DecodedExtractionResponse =
  | { readonly success: true; readonly output: ExtractionOutput }
  | {
      readonly success: false;
      readonly issues: Array<{ code: string; message: string; path?: string }>;
    };

export function decodeExtractionResponse(
  text: string,
  sourceItems: readonly SourceItem[],
): DecodedExtractionResponse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      success: false,
      issues: [{ code: "invalid_json", message: "Provider output was not valid JSON" }],
    };
  }
  const parsed = extractionOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.slice(0, 32).map((issue) => ({
        code: "schema_validation_failed",
        message: issue.message,
        ...(issue.path.length === 0 ? {} : { path: issue.path.join(".") }),
      })),
    };
  }
  const issues = validateEvidence(parsed.data, sourceItems);
  return issues.length === 0 ? { success: true, output: parsed.data } : { success: false, issues };
}

function validateEvidence(output: ExtractionOutput, items: readonly SourceItem[]) {
  const byId = new Map(items.map((item) => [item._id as string, item]));
  const references = [
    ...output.evidence,
    ...output.conflicts,
    ...output.symptoms.flatMap((value) =>
      value.evidenceSourceItemIds.map((sourceItemId) => ({ sourceItemId })),
    ),
    ...(output.rootCause?.evidenceSourceItemIds.map((sourceItemId) => ({ sourceItemId })) ?? []),
    ...output.attemptedApproaches.flatMap((value) =>
      value.evidenceSourceItemIds.map((sourceItemId) => ({ sourceItemId })),
    ),
    ...output.solutionSteps.flatMap((value) =>
      value.evidenceSourceItemIds.map((sourceItemId) => ({ sourceItemId })),
    ),
    ...output.verificationLabels.flatMap((value) =>
      value.evidenceSourceItemIds.map((sourceItemId) => ({ sourceItemId })),
    ),
  ];
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  for (const reference of references) {
    if (!byId.has(reference.sourceItemId)) {
      issues.push({
        code: "unknown_evidence_reference",
        message: `Unknown source item ${reference.sourceItemId}`,
      });
    }
  }
  for (const reference of [...output.evidence, ...output.conflicts]) {
    const item = byId.get(reference.sourceItemId);
    const evidenceTexts = [
      item?.content.text,
      item?.structuredBlocks?.map((block) => block.text).join("\n"),
    ].filter((value): value is string => value !== undefined);
    if (item !== undefined && !evidenceTexts.some((text) => text.includes(reference.excerpt))) {
      issues.push({
        code: "evidence_excerpt_mismatch",
        message: `Excerpt is not present in ${reference.sourceItemId}`,
      });
    }
  }
  return issues.slice(0, 32);
}
