import type { ExtractionPromptReference, ExtractionStrategy } from "@knownpath/domain";

import { sha256 } from "./digests.js";
import { GITHUB_PROMPT } from "./prompts/github.js";
import { OFFICIAL_PROMPT } from "./prompts/official.js";
import { SHARED_PROMPT } from "./prompts/shared.js";

interface PromptSource {
  readonly identifier: string;
  readonly text: string;
  readonly version: number;
}

export interface PromptBundle {
  readonly references: readonly ExtractionPromptReference[];
  readonly systemInstruction: string;
}

export function getPromptBundle(strategy: ExtractionStrategy): PromptBundle {
  const sources: readonly PromptSource[] = [
    SHARED_PROMPT,
    strategy === "github_thread" ? GITHUB_PROMPT : OFFICIAL_PROMPT,
  ];
  return {
    references: sources.map((source) => ({
      identifier: source.identifier,
      version: source.version,
      digest: sha256(source.text),
    })),
    systemInstruction: sources.map((source) => source.text).join("\n\n"),
  };
}
