import semver from "semver";

import type { RetrievalQuery, VersionFit } from "@knownpath/domain";

export function evaluateVersionFit(
  query: RetrievalQuery,
  stored: readonly { subject: string; value: string }[],
): { fit: VersionFit; explanations: string[] } {
  if (query.versions.length === 0 || stored.length === 0)
    return {
      fit: "unknown",
      explanations: [
        "Version compatibility is unknown because one side has no explicit constraint.",
      ],
    };
  let comparable = false;
  for (const requested of query.versions) {
    const matches = stored.filter(
      (entry) => entry.subject.toLowerCase() === requested.subject.toLowerCase(),
    );
    for (const candidate of matches) {
      const result = compareVersions(requested.value, candidate.value);
      if (result === "exact")
        return {
          fit: "exact",
          explanations: [
            `Requested ${requested.subject} ${requested.value} exactly matches persisted applicability.`,
          ],
        };
      if (result === "compatible")
        return {
          fit: "compatible",
          explanations: [
            `Requested ${requested.subject} ${requested.value} is compatible with persisted ${candidate.value}.`,
          ],
        };
      if (result === "incompatible") comparable = true;
    }
  }
  if (comparable)
    return {
      fit: "incompatible",
      explanations: ["Explicit valid version constraints are incompatible."],
    };
  return {
    fit: "unknown",
    explanations: ["Version strings could not be compared without guessing."],
  };
}

function compareVersions(left: string, right: string): VersionFit {
  const normalizedLeft = left.trim().replace(/^v/u, "");
  const normalizedRight = right.trim().replace(/^v/u, "");
  if (normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()) return "exact";
  const leftVersion = semver.valid(normalizedLeft);
  const rightVersion = semver.valid(normalizedRight);
  const leftRange = semver.validRange(normalizedLeft);
  const rightRange = semver.validRange(normalizedRight);
  if (leftVersion !== null && rightRange !== null && semver.satisfies(leftVersion, rightRange))
    return "compatible";
  if (rightVersion !== null && leftRange !== null && semver.satisfies(rightVersion, leftRange))
    return "compatible";
  if (leftRange !== null && rightRange !== null)
    return semver.intersects(leftRange, rightRange) ? "compatible" : "incompatible";
  const sdkLeft = normalizedLeft.match(/(?:sdk\s*)?(\d+)/iu)?.[1];
  const sdkRight = normalizedRight.match(/(?:sdk\s*)?(\d+)/iu)?.[1];
  if (sdkLeft !== undefined && sdkRight !== undefined)
    return sdkLeft === sdkRight ? "compatible" : "incompatible";
  return "unknown";
}
