/**
 * Draft Workflow
 *
 * Implements the 6-step Draft workflow:
 * 1. Hash window selection (done by caller)
 * 2. Intent & Bridge loading
 * 3. Embedding filtering (find relevant sentences)
 * 4. Polish (LLM generation)
 * 5. Validate (check Must-Have / Mustn't-Have)
 * 6. User review (done by caller)
 */

import { BridgeLoader, BridgeTemplate } from "../bridges";
import { RingExtractor } from "../extractors";
import { EmbeddingProvider } from "../providers/embedding";
import { LLMProvider } from "../llm";
import { MustHaveValidator } from "./validator";
import {
  DraftConfig,
  DraftResult,
  Turn,
  EvidenceSentence,
  ValidationResult,
} from "./types";

/**
 * Draft Workflow
 */
export class DraftWorkflow {
  private readonly bridgeLoader: BridgeLoader;
  private readonly extractor: RingExtractor;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly llmProvider: LLMProvider;
  private readonly validator: MustHaveValidator;

  constructor(
    bridgeLoader: BridgeLoader,
    extractor: RingExtractor,
    embeddingProvider: EmbeddingProvider,
    llmProvider: LLMProvider
  ) {
    this.bridgeLoader = bridgeLoader;
    this.extractor = extractor;
    this.embeddingProvider = embeddingProvider;
    this.llmProvider = llmProvider;
    this.validator = new MustHaveValidator();
  }

  /**
   * Execute complete Draft workflow
   *
   * @param config - Draft configuration
   * @param turnWindow - Turn window (from last commit to current)
   * @param userIntent - User intent (free text)
   * @returns Draft result
   */
  async run(
    config: DraftConfig,
    turnWindow: Turn[],
    userIntent: string
  ): Promise<DraftResult> {
    // Step 1: Hash window selection (already done by caller)

    // Step 2: Intent & Bridge
    const { template: bridge, threshold } = this.bridgeLoader.getWithThreshold(
      config.bridgeId,
      config.similarityThreshold
    );

    if (!bridge) {
      throw new Error(`Bridge '${config.bridgeId}' not found`);
    }

    // Step 3: Embedding filtering
    const evidenceSentences = await this.embeddingFilter(
      turnWindow,
      bridge.prompt,
      userIntent,
      threshold
    );

    // Extract Must-Have / Mustn't-Have from evidence
    const { mustHave, mustntHave } = this.extractMustMustnt(evidenceSentences);

    // Step 4 & 5: Polish + Validate loop
    const { text: draftText, iterations } = await this.polishAndValidate(
      bridge,
      userIntent,
      evidenceSentences,
      mustHave,
      mustntHave
    );

    // Step 6: User review (done by caller, return result here)

    // Generate draft_id
    const now = new Date();
    const draftId = `draft_${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;

    return {
      draftId,
      projectId: config.projectId,
      baseCommitHash: config.baseCommitHash,
      turnAnchorHash: config.turnAnchorHash,
      bridgeId: config.bridgeId,
      bridgePayload: {
        bridge: bridge.bridge,
        label: bridge.label,
        version: bridge.version,
        locale: bridge.locale,
        threshold: bridge.threshold,
        description: bridge.description,
      },
      mustHave,
      mustntHave,
      text: draftText,
      status: "ephemeral",
      createdAt: now.toISOString(),
      schemaVersion: "draft_v1",
      evidenceSentences,
      validationIterations: iterations,
    };
  }

  /**
   * Step 3: Embedding filtering
   *
   * Use Ring 3 segments + similarity calculation to filter relevant sentences.
   */
  private async embeddingFilter(
    turnWindow: Turn[],
    bridgePrompt: string,
    userIntent: string,
    threshold: number
  ): Promise<EvidenceSentence[]> {
    // 1. Perform Ring extraction for each turn
    const allSegments: Array<{
      turnHash: string;
      segmentId: string;
      text: string;
      keywords: string[];
      polarityKeywords: Record<string, number>;
    }> = [];

    for (const turn of turnWindow) {
      const ringOutput = await this.extractor.extract(turn.turnHash, turn.content);

      // Collect Ring 3 segments with Ring 1 keywords
      for (const segment of ringOutput.ring3.segments) {
        const polarityKeywords: Record<string, number> = {};
        const keywords: string[] = [];

        for (const kw of ringOutput.ring1.keywords) {
          keywords.push(kw.lemma);
          if (kw.polarity !== 0) {
            polarityKeywords[kw.lemma] = kw.polarity;
          }
        }

        allSegments.push({
          turnHash: turn.turnHash,
          segmentId: segment.segmentId,
          text: segment.text,
          keywords,
          polarityKeywords,
        });
      }
    }

    if (allSegments.length === 0) {
      return [];
    }

    // 2. Calculate query vector (Bridge prompt + user intent)
    const queryText = `${bridgePrompt}\n\n${userIntent}`;
    const [queryVec] = await this.embeddingProvider.encode([queryText]);

    // 3. Calculate similarity for each sentence
    const segmentTexts = allSegments.map((seg) => seg.text);
    const segmentVecs = await this.embeddingProvider.encode(segmentTexts);

    const evidenceSentences: EvidenceSentence[] = [];

    for (let i = 0; i < allSegments.length; i++) {
      const seg = allSegments[i];
      const similarity = this.embeddingProvider.similarity(queryVec, segmentVecs[i]);

      // Filter sentences above threshold
      if (similarity >= threshold) {
        evidenceSentences.push({
          segmentId: seg.segmentId,
          text: seg.text,
          turnHash: seg.turnHash,
          similarityScore: similarity,
          keywords: seg.keywords,
          polarityKeywords: seg.polarityKeywords,
        });
      }
    }

    // Sort by similarity in descending order
    evidenceSentences.sort((a, b) => b.similarityScore - a.similarityScore);

    return evidenceSentences;
  }

  /**
   * Extract Must-Have / Mustn't-Have lists from evidence
   *
   * Based on Ring 1 polarity:
   * - polarity == +1 → Must-Have
   * - polarity == -1 → Mustn't-Have
   */
  private extractMustMustnt(
    evidenceSentences: EvidenceSentence[]
  ): { mustHave: string[]; mustntHave: string[] } {
    const mustHaveSet = new Set<string>();
    const mustntHaveSet = new Set<string>();

    for (const evidence of evidenceSentences) {
      for (const [keyword, polarity] of Object.entries(evidence.polarityKeywords)) {
        if (polarity === 1) {
          mustHaveSet.add(keyword);
        } else if (polarity === -1) {
          mustntHaveSet.add(keyword);
        }
      }
    }

    return {
      mustHave: Array.from(mustHaveSet),
      mustntHave: Array.from(mustntHaveSet),
    };
  }

  /**
   * Step 4 & 5: Polish (LLM) + Validate loop
   *
   * Loop until Must-Have / Mustn't-Have constraints are satisfied,
   * or max iterations reached.
   */
  private async polishAndValidate(
    bridge: BridgeTemplate,
    userIntent: string,
    evidenceSentences: EvidenceSentence[],
    mustHave: string[],
    mustntHave: string[],
    maxIterations = 3
  ): Promise<{ text: string; iterations: number }> {
    // Build evidence text (top 10 only)
    const evidenceText = evidenceSentences
      .slice(0, 10)
      .map(
        (ev, i) =>
          `[Evidence ${i + 1}] (score: ${ev.similarityScore.toFixed(2)})\n${ev.text}`
      )
      .join("\n\n");

    const basePrompt = `${bridge.prompt}

[User Intent]
${userIntent}

[Evidence (Filtered)]
${evidenceText}

[Required Keywords (Must-Have)]
${mustHave.join(", ") || "(none)"}

[Forbidden Keywords (Mustn't-Have)]
${mustntHave.join(", ") || "(none)"}

Please strictly follow the above requirements to generate the draft.`;

    let draftText = "";
    let validationResult: ValidationResult | null = null;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Step 4: Polish (call LLM)
      let prompt: string;

      if (iteration === 0) {
        prompt = basePrompt;
      } else {
        // Subsequent iterations: attach previous version + feedback
        const feedback = this.buildFeedback(validationResult!);
        prompt = `${basePrompt}

[Previous Draft]
${draftText}

[Feedback]
${feedback}

Please revise the draft based on the feedback.`;
      }

      draftText = await this.llmProvider.generate(prompt, {
        temperature: 0.3,
        maxTokens: 2048,
      });

      // Step 5: Validate
      validationResult = this.validator.validate(draftText, mustHave, mustntHave);

      // If validation passed, return
      if (validationResult.passed) {
        return { text: draftText, iterations: iteration + 1 };
      }
    }

    // Max iterations reached, return last version
    return { text: draftText, iterations: maxIterations };
  }

  /**
   * Build feedback message for LLM regeneration
   */
  private buildFeedback(validationResult: ValidationResult): string {
    const parts: string[] = [];

    if (validationResult.missingMustHave.length > 0) {
      parts.push(
        `Missing the following Must-Have keywords: ${validationResult.missingMustHave.join(", ")}`
      );
    }

    if (validationResult.violatedMustntHave.length > 0) {
      parts.push(
        `Contains the following forbidden Mustn't-Have keywords: ${validationResult.violatedMustntHave.join(", ")}`
      );
    }

    return parts.join("\n");
  }
}

/**
 * Create a Draft Workflow
 */
export function createDraftWorkflow(
  bridgeLoader: BridgeLoader,
  extractor: RingExtractor,
  embeddingProvider: EmbeddingProvider,
  llmProvider: LLMProvider
): DraftWorkflow {
  return new DraftWorkflow(bridgeLoader, extractor, embeddingProvider, llmProvider);
}
