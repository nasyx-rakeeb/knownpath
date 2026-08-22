export const OFFICIAL_PROMPT = {
  identifier: "knownpath-official-document-extraction",
  version: 1,
  text: `Treat the evidence as an official documentation page or release note.
Extract a reusable experience only when the document contains a concrete technical problem, compatibility constraint, migration, deprecation, breaking change, or troubleshooting solution. Preserve explicit version conditions and ordered procedures. Official status is objective source metadata, not a reason to invent missing details.`,
} as const;
