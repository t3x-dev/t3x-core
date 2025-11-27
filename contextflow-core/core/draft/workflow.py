"""
Draft Workflow core process

Implements the 6-step Draft workflow defined in documentation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol

from ..bridges import BridgeLoader, BridgeTemplate
from ..extractors import RingExtractor, ExtractorConfig
from ..extractors.base import Ring1Output, Ring3Output
from .validator import MustHaveValidator, ValidationResult


def utc_now_iso() -> str:
    """Return UTC timestamp (ISO 8601 format)"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class DraftConfig:
    """
    Draft configuration

    Corresponds to Draft Ledger configuration fields in documentation.
    """

    project_id: str
    base_commit_hash: Optional[str] = None  # Base commit (optional)
    turn_anchor_hash: Optional[str] = None  # Focal turn (optional)
    bridge_id: str = "plan"  # Bridge mode

    # LLM configuration
    llm_provider: str = "openai"
    llm_model: str = "gpt-4"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048

    # Embedding/similarity configuration
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    similarity_threshold: Optional[float] = None  # If None, use Bridge's threshold

    # Extractor configuration
    extractor_config: Optional[ExtractorConfig] = None


@dataclass
class EvidenceSentence:
    """
    Evidence sentence (result after embedding filtering)

    Corresponds to "similarity-scored sentences" in documentation.
    """

    segment_id: str
    text: str
    turn_hash: str
    similarity_score: float
    ring1_keywords: List[str]  # Ring 1 keywords (normalized)
    polarity_keywords: Dict[str, int]  # {keyword: polarity}


@dataclass
class DraftResult:
    """
    Draft generation result

    Corresponds to Draft Ledger output in documentation.
    """

    draft_id: str
    project_id: str
    base_commit_hash: Optional[str]
    turn_anchor_hash: Optional[str]
    bridge_id: str
    bridge_payload: Dict[str, Any]  # Bridge configuration snapshot

    must_have: List[str]  # Must-Have keyword list
    mustnt_have: List[str]  # Mustn't-Have keyword list

    llm_config: Dict[str, Any]  # LLM configuration snapshot
    text: str  # Generated draft text

    status: str = "ephemeral"  # ephemeral | adopted | superseded
    created_at: str = field(default_factory=utc_now_iso)
    schema_version: str = "draft_v1"

    # Additional debug information (not written to Ledger)
    evidence_sentences: List[EvidenceSentence] = field(default_factory=list)
    validation_iterations: int = 0


# Protocol for LLM providers (Agentic Layer)
class LLMProvider(Protocol):
    """
    LLM provider interface (implemented by Agentic Layer)

    Draft Workflow step 4 (Polish) requires calling LLM.
    This interface is implemented by external Agentic Layer.
    """

    def generate(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> str:
        """
        Generate text

        Args:
            prompt: Complete prompt (including Bridge template + Evidence)
            temperature: Generation temperature
            max_tokens: Maximum number of tokens

        Returns:
            Generated text
        """
        ...


# Protocol for Embedding providers (Core)
class EmbeddingProvider(Protocol):
    """
    Embedding provider interface (implemented by Core)

    Draft Workflow step 3 (embedding filtering) requires calculating similarity.
    """

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        Encode texts to vectors

        Args:
            texts: List of texts

        Returns:
            List of vectors
        """
        ...

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        Calculate similarity between two vectors

        Args:
            vec_a: Vector A
            vec_b: Vector B

        Returns:
            Similarity score (0~1)
        """
        ...


class DraftWorkflow:
    """
    Draft Workflow main process

    Implements the 6-step workflow from documentation.
    """

    def __init__(
        self,
        bridge_loader: BridgeLoader,
        extractor: RingExtractor,
        embedding_provider: EmbeddingProvider,
        llm_provider: LLMProvider,
    ):
        """
        Initialize Draft Workflow

        Args:
            bridge_loader: Bridge loader
            extractor: Ring extractor
            embedding_provider: Embedding provider
            llm_provider: LLM provider
        """
        self.bridge_loader = bridge_loader
        self.extractor = extractor
        self.embedding_provider = embedding_provider
        self.llm_provider = llm_provider
        self.validator = MustHaveValidator()

    def run(
        self,
        config: DraftConfig,
        turn_window: List[tuple[str, str, str]],  # [(turn_hash, role, content), ...]
        user_intent: str,
    ) -> DraftResult:
        """
        Execute complete Draft workflow

        Args:
            config: Draft configuration
            turn_window: Turn window (from last commit to current)
            user_intent: User intent (free text)

        Returns:
            DraftResult
        """
        # Step 1: Hash window selection (already done by caller, receiving window here)

        # Step 2: Intent & Bridge
        bridge, threshold = self.bridge_loader.get_with_threshold(
            config.bridge_id,
            cli_threshold=config.similarity_threshold,
        )
        if bridge is None:
            raise ValueError(f"Bridge '{config.bridge_id}' not found")

        # Step 3: Embedding filtering
        evidence_sentences = self._embedding_filter(
            turn_window=turn_window,
            bridge_prompt=bridge.prompt,
            user_intent=user_intent,
            threshold=threshold,
        )

        # Extract Must-Have / Mustn't-Have from evidence
        must_have, mustnt_have = self._extract_must_mustnt(evidence_sentences)

        # Step 4 & 5: Polish + Validate loop
        draft_text = self._polish_and_validate(
            bridge=bridge,
            user_intent=user_intent,
            evidence_sentences=evidence_sentences,
            must_have=must_have,
            mustnt_have=mustnt_have,
            config=config,
        )

        # Step 6: User review (done by caller, return result here)

        # Generate draft_id
        draft_id = f"draft_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

        return DraftResult(
            draft_id=draft_id,
            project_id=config.project_id,
            base_commit_hash=config.base_commit_hash,
            turn_anchor_hash=config.turn_anchor_hash,
            bridge_id=config.bridge_id,
            bridge_payload=bridge.to_dict(),
            must_have=must_have,
            mustnt_have=mustnt_have,
            llm_config={
                "provider": config.llm_provider,
                "model": config.llm_model,
                "temperature": config.llm_temperature,
                "max_tokens": config.llm_max_tokens,
            },
            text=draft_text,
            evidence_sentences=evidence_sentences,
        )

    def _embedding_filter(
        self,
        turn_window: List[tuple[str, str, str]],
        bridge_prompt: str,
        user_intent: str,
        threshold: float,
    ) -> List[EvidenceSentence]:
        """
        Step 3: Embedding filtering

        Use Ring 3 segments + similarity calculation to filter highly relevant sentences.
        """
        # 1. Perform Ring extraction for each turn
        all_segments = []
        for turn_hash, role, content in turn_window:
            ring_output = self.extractor.extract(turn_hash, content)

            # Collect Ring 3 segments
            for segment in ring_output.ring3.segments:
                all_segments.append({
                    "turn_hash": turn_hash,
                    "segment_id": segment.segment_id,
                    "text": segment.text,
                    "ring1": ring_output.ring1,
                })

        # 2. Calculate query vector (Bridge prompt + user intent)
        query_text = f"{bridge_prompt}\n\n{user_intent}"
        query_vec = self.embedding_provider.encode([query_text])[0]

        # 3. Calculate similarity for each sentence
        segment_texts = [seg["text"] for seg in all_segments]
        segment_vecs = self.embedding_provider.encode(segment_texts)

        evidence_sentences = []
        for seg, vec in zip(all_segments, segment_vecs):
            similarity = self.embedding_provider.similarity(query_vec, vec)

            # Filter sentences above threshold
            if similarity >= threshold:
                # Extract Ring 1 keywords
                ring1: Ring1Output = seg["ring1"]
                keywords = [kw.lemma for kw in ring1.keywords]
                polarity_keywords = {
                    kw.lemma: kw.polarity
                    for kw in ring1.keywords
                    if kw.polarity != 0
                }

                evidence_sentences.append(EvidenceSentence(
                    segment_id=seg["segment_id"],
                    text=seg["text"],
                    turn_hash=seg["turn_hash"],
                    similarity_score=similarity,
                    ring1_keywords=keywords,
                    polarity_keywords=polarity_keywords,
                ))

        # Sort by similarity in descending order
        evidence_sentences.sort(key=lambda x: x.similarity_score, reverse=True)

        return evidence_sentences

    def _extract_must_mustnt(
        self,
        evidence_sentences: List[EvidenceSentence],
    ) -> tuple[List[str], List[str]]:
        """
        Extract Must-Have / Mustn't-Have lists from evidence

        Based on Ring 1 polarity:
        - polarity == +1 → Must-Have
        - polarity == -1 → Mustn't-Have
        """
        must_have = set()
        mustnt_have = set()

        for evidence in evidence_sentences:
            for keyword, polarity in evidence.polarity_keywords.items():
                if polarity == 1:
                    must_have.add(keyword)
                elif polarity == -1:
                    mustnt_have.add(keyword)

        return list(must_have), list(mustnt_have)

    def _polish_and_validate(
        self,
        bridge: BridgeTemplate,
        user_intent: str,
        evidence_sentences: List[EvidenceSentence],
        must_have: List[str],
        mustnt_have: List[str],
        config: DraftConfig,
        max_iterations: int = 3,
    ) -> str:
        """
        Step 4 & 5: Polish (LLM) + Validate loop

        Loop until Must-Have / Mustn't-Have constraints are satisfied, or max iterations reached.
        """
        # Build initial prompt
        evidence_text = "\n\n".join([
            f"[Evidence {i+1}] (score: {ev.similarity_score:.2f})\n{ev.text}"
            for i, ev in enumerate(evidence_sentences[:10])  # Only take top 10
        ])

        base_prompt = f"""
{bridge.prompt}

[User Intent]
{user_intent}

[Evidence (Filtered)]
{evidence_text}

[Required Keywords (Must-Have)]
{', '.join(must_have)}

[Forbidden Keywords (Mustn't-Have)]
{', '.join(mustnt_have)}

Please strictly follow the above requirements to generate the draft.
"""

        draft_text = None
        validation_result = None

        for iteration in range(max_iterations):
            # Step 4: Polish (call LLM)
            if iteration == 0:
                prompt = base_prompt
            else:
                # Subsequent iterations: attach previous version + missing/violated list
                feedback = self._build_feedback(validation_result)
                prompt = f"""
{base_prompt}

[Previous Draft]
{draft_text}

[Feedback]
{feedback}

Please revise the draft based on the feedback.
"""

            draft_text = self.llm_provider.generate(
                prompt=prompt,
                temperature=config.llm_temperature,
                max_tokens=config.llm_max_tokens,
            )

            # Step 5: Validate
            validation_result = self.validator.validate(
                text=draft_text,
                must_have=must_have,
                mustnt_have=mustnt_have,
            )

            # If validation passed, return
            if validation_result.passed:
                return draft_text

        # Max iterations reached, return last version (even if not fully passed)
        return draft_text

    def _build_feedback(self, validation_result: ValidationResult) -> str:
        """Build feedback message (for LLM regeneration)"""
        feedback_parts = []

        if validation_result.missing_must_have:
            feedback_parts.append(
                f"Missing the following Must-Have keywords: {', '.join(validation_result.missing_must_have)}"
            )

        if validation_result.violated_mustnt_have:
            feedback_parts.append(
                f"Contains the following forbidden Mustn't-Have keywords: {', '.join(validation_result.violated_mustnt_have)}"
            )

        return "\n".join(feedback_parts)
