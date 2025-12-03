/**
 * NLP Provider Interface
 *
 * Defines the contract for all NLP providers (Google Cloud NLP, etc.)
 * Providers analyze text and return linguistic annotations.
 *
 * Based on ARCHITECTURE.zh.md Ring 1-3 requirements:
 * - Ring 1: keywords, lemmatization, polarity, entities, time_anchor
 * - Ring 2: intent_seed, time_window, preference_soft, unknown_slot
 * - Ring 3: sentence segmentation
 */

/**
 * Dependency edge label (for polarity analysis)
 */
export type DependencyLabel =
  | "ROOT"      // Root of the tree
  | "NSUBJ"     // Nominal subject
  | "DOBJ"      // Direct object
  | "POBJ"      // Object of preposition
  | "IOBJ"      // Indirect object
  | "ATTR"      // Attribute
  | "ACOMP"     // Adjectival complement
  | "XCOMP"     // Open clausal complement
  | "CCOMP"     // Clausal complement
  | "NEG"       // Negation modifier
  | "ADVMOD"    // Adverbial modifier
  | "AUX"       // Auxiliary
  | "AUXPASS"   // Passive auxiliary
  | "PREP"      // Prepositional modifier
  | "DET"       // Determiner
  | "AMOD"      // Adjectival modifier
  | "NN"        // Noun compound modifier
  | "CONJ"      // Conjunct
  | "CC"        // Coordinating conjunction
  | "MARK"      // Marker
  | "PUNCT"     // Punctuation
  | "P"         // Punctuation (alternative)
  | "UNKNOWN";  // Unknown

/**
 * Token from NLP analysis with dependency parsing
 */
export interface NLPToken {
  /** Token index in document */
  index: number;
  /** Original text */
  text: string;
  /** Lemmatized form (词形归一) */
  lemma: string;
  /** Part-of-speech tag (Universal Dependencies) */
  pos: string;
  /** Detailed POS tag (if available) */
  tag?: string;
  /** Character offset start */
  beginOffset: number;
  /** Character offset end */
  endOffset: number;
  /** Dependency edge: index of head token (-1 for root) */
  headIndex: number;
  /** Dependency label (e.g., NSUBJ, DOBJ, NEG) */
  dependencyLabel: DependencyLabel | string;
}

/**
 * Named entity from NLP analysis
 */
export interface NLPEntity {
  /** Entity text */
  text: string;
  /** Entity type (PERSON, LOCATION, ORGANIZATION, DATE, etc.) */
  type: string;
  /** Salience score [0, 1] */
  salience: number;
  /** Character offset start */
  beginOffset?: number;
  /** Character offset end */
  endOffset?: number;
}

/**
 * Sentence from NLP analysis
 */
export interface NLPSentence {
  /** Sentence text */
  text: string;
  /** Sentence-level sentiment score [-1, 1] */
  sentiment: number;
  /** Character offset start */
  beginOffset: number;
  /** Character offset end */
  endOffset: number;
}

/**
 * Complete NLP analysis result
 */
export interface NLPAnalysis {
  /** Detected or specified language code (e.g., "en", "zh") */
  language: string;

  /** Document-level sentiment */
  sentiment: {
    /** Sentiment score [-1, 1] (negative to positive) */
    score: number;
    /** Sentiment magnitude [0, inf) (strength of emotion) */
    magnitude: number;
  };

  /** Extracted tokens with linguistic annotations and dependency tree */
  tokens: NLPToken[];

  /** Named entities */
  entities: NLPEntity[];

  /** Sentence segmentation */
  sentences: NLPSentence[];
}

/**
 * NLP Provider interface
 *
 * All NLP providers must implement this interface.
 */
export interface NLPProvider {
  /**
   * Unique identifier for this provider
   * Example: "google-cloud-nlp"
   */
  readonly id: string;

  /**
   * Analyze text and return linguistic annotations
   *
   * @param text - Text to analyze
   * @param language - Optional language code. If not provided, auto-detect.
   * @returns Promise of NLP analysis result
   */
  analyze(text: string, language?: string): Promise<NLPAnalysis>;
}

/**
 * Error thrown when NLP provider is unavailable
 */
export class NLPProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly cause?: Error,
    message?: string
  ) {
    super(message ?? `NLP provider "${providerId}" is unavailable`);
    this.name = "NLPProviderError";
  }
}

/**
 * Map provider-specific POS tags to Universal Dependencies tags
 */
export const POS_TAG_MAPPING: Record<string, string> = {
  // Google Cloud NLP tags
  NOUN: "NOUN",
  VERB: "VERB",
  ADJ: "ADJ",
  ADV: "ADV",
  PRON: "PRON",
  DET: "DET",
  ADP: "ADP",
  NUM: "NUM",
  CONJ: "CCONJ",
  PRT: "PART",
  PUNCT: "PUNCT",
  X: "X",
  AFFIX: "X",
  UNKNOWN: "X",
};

/**
 * Normalize POS tag to Universal Dependencies format
 */
export function normalizePosTag(tag: string): string {
  return POS_TAG_MAPPING[tag.toUpperCase()] ?? tag.toUpperCase();
}

/**
 * Normalize dependency label
 */
export function normalizeDependencyLabel(label: string): DependencyLabel | string {
  const normalized = label.toUpperCase();
  // Map common variations
  const mapping: Record<string, DependencyLabel> = {
    ROOT: "ROOT",
    NSUBJ: "NSUBJ",
    NSUBJPASS: "NSUBJ",
    DOBJ: "DOBJ",
    OBJ: "DOBJ",
    POBJ: "POBJ",
    IOBJ: "IOBJ",
    ATTR: "ATTR",
    ACOMP: "ACOMP",
    XCOMP: "XCOMP",
    CCOMP: "CCOMP",
    NEG: "NEG",
    ADVMOD: "ADVMOD",
    AUX: "AUX",
    AUXPASS: "AUXPASS",
    PREP: "PREP",
    DET: "DET",
    AMOD: "AMOD",
    NN: "NN",
    COMPOUND: "NN",
    CONJ: "CONJ",
    CC: "CC",
    MARK: "MARK",
    PUNCT: "PUNCT",
    P: "P",
  };
  return mapping[normalized] ?? normalized;
}
