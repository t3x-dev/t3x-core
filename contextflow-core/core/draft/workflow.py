"""
Draft Workflow 核心流程

实现文档中定义的 6 步 Draft 流程。
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
    """返回 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class DraftConfig:
    """
    Draft 配置

    对应文档中的 Draft Ledger 配置字段。
    """

    project_id: str
    base_commit_hash: Optional[str] = None  # 基准 commit（可选）
    turn_anchor_hash: Optional[str] = None  # 焦点 turn（可选）
    bridge_id: str = "plan"  # Bridge 模式

    # LLM 配置
    llm_provider: str = "openai"
    llm_model: str = "gpt-4"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048

    # 嵌入/相似度配置
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    similarity_threshold: Optional[float] = None  # 如果为 None，使用 Bridge 的阈值

    # 提取器配置
    extractor_config: Optional[ExtractorConfig] = None


@dataclass
class EvidenceSentence:
    """
    证据句子（嵌入筛选后的结果）

    对应文档中的"相似度评分后的句子"。
    """

    segment_id: str
    text: str
    turn_hash: str
    similarity_score: float
    ring1_keywords: List[str]  # Ring 1 关键词（已归一）
    polarity_keywords: Dict[str, int]  # {keyword: polarity}


@dataclass
class DraftResult:
    """
    Draft 生成结果

    对应文档中的 Draft Ledger 输出。
    """

    draft_id: str
    project_id: str
    base_commit_hash: Optional[str]
    turn_anchor_hash: Optional[str]
    bridge_id: str
    bridge_payload: Dict[str, Any]  # Bridge 配置快照

    must_have: List[str]  # Must-Have 关键词列表
    mustnt_have: List[str]  # Mustn't-Have 关键词列表

    llm_config: Dict[str, Any]  # LLM 配置快照
    text: str  # 生成的草稿文本

    status: str = "ephemeral"  # ephemeral | adopted | superseded
    created_at: str = field(default_factory=utc_now_iso)
    schema_version: str = "draft_v1"

    # 额外的调试信息（不写入 Ledger）
    evidence_sentences: List[EvidenceSentence] = field(default_factory=list)
    validation_iterations: int = 0


# Protocol for LLM providers (Agentic Layer)
class LLMProvider(Protocol):
    """
    LLM 提供者接口（Agentic Layer 实现）

    Draft Workflow 的步骤 4（Polish）需要调用 LLM。
    这个接口由外部 Agentic Layer 实现。
    """

    def generate(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> str:
        """
        生成文本

        Args:
            prompt: 完整的提示词（包含 Bridge 模板 + Evidence）
            temperature: 生成温度
            max_tokens: 最大 token 数

        Returns:
            生成的文本
        """
        ...


# Protocol for Embedding providers (Core)
class EmbeddingProvider(Protocol):
    """
    嵌入提供者接口（Core 实现）

    Draft Workflow 的步骤 3（嵌入筛选）需要计算相似度。
    """

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        编码文本为向量

        Args:
            texts: 文本列表

        Returns:
            向量列表
        """
        ...

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        计算两个向量的相似度

        Args:
            vec_a: 向量 A
            vec_b: 向量 B

        Returns:
            相似度分数（0~1）
        """
        ...


class DraftWorkflow:
    """
    Draft Workflow 主流程

    实现文档中的 6 步流程。
    """

    def __init__(
        self,
        bridge_loader: BridgeLoader,
        extractor: RingExtractor,
        embedding_provider: EmbeddingProvider,
        llm_provider: LLMProvider,
    ):
        """
        初始化 Draft Workflow

        Args:
            bridge_loader: Bridge 加载器
            extractor: Ring 提取器
            embedding_provider: 嵌入提供者
            llm_provider: LLM 提供者
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
        执行完整的 Draft 流程

        Args:
            config: Draft 配置
            turn_window: Turn 窗口（从上一个 commit 到当前）
            user_intent: 用户意图（自由文本）

        Returns:
            DraftResult
        """
        # Step 1: 哈希窗口选择（已由调用者完成，这里接收窗口）

        # Step 2: Intent & Bridge
        bridge, threshold = self.bridge_loader.get_with_threshold(
            config.bridge_id,
            cli_threshold=config.similarity_threshold,
        )
        if bridge is None:
            raise ValueError(f"Bridge '{config.bridge_id}' not found")

        # Step 3: 嵌入筛选
        evidence_sentences = self._embedding_filter(
            turn_window=turn_window,
            bridge_prompt=bridge.prompt,
            user_intent=user_intent,
            threshold=threshold,
        )

        # 从 evidence 中提取 Must-Have / Mustn't-Have
        must_have, mustnt_have = self._extract_must_mustnt(evidence_sentences)

        # Step 4 & 5: Polish + Validate 循环
        draft_text = self._polish_and_validate(
            bridge=bridge,
            user_intent=user_intent,
            evidence_sentences=evidence_sentences,
            must_have=must_have,
            mustnt_have=mustnt_have,
            config=config,
        )

        # Step 6: 用户审核（由调用者完成，这里返回结果）

        # 生成 draft_id
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
        Step 3: 嵌入筛选

        使用 Ring 3 分句 + 相似度计算，筛选高相关句子。
        """
        # 1. 对每个 turn 进行 Ring 提取
        all_segments = []
        for turn_hash, role, content in turn_window:
            ring_output = self.extractor.extract(turn_hash, content)

            # 收集 Ring 3 分句
            for segment in ring_output.ring3.segments:
                all_segments.append({
                    "turn_hash": turn_hash,
                    "segment_id": segment.segment_id,
                    "text": segment.text,
                    "ring1": ring_output.ring1,
                })

        # 2. 计算查询向量（Bridge 提示词 + 用户意图）
        query_text = f"{bridge_prompt}\n\n{user_intent}"
        query_vec = self.embedding_provider.encode([query_text])[0]

        # 3. 计算每个句子的相似度
        segment_texts = [seg["text"] for seg in all_segments]
        segment_vecs = self.embedding_provider.encode(segment_texts)

        evidence_sentences = []
        for seg, vec in zip(all_segments, segment_vecs):
            similarity = self.embedding_provider.similarity(query_vec, vec)

            # 筛选高于阈值的句子
            if similarity >= threshold:
                # 提取 Ring 1 关键词
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

        # 按相似度降序排序
        evidence_sentences.sort(key=lambda x: x.similarity_score, reverse=True)

        return evidence_sentences

    def _extract_must_mustnt(
        self,
        evidence_sentences: List[EvidenceSentence],
    ) -> tuple[List[str], List[str]]:
        """
        从 evidence 中提取 Must-Have / Mustn't-Have 列表

        基于 Ring 1 极性：
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
        Step 4 & 5: Polish（LLM）+ Validate 循环

        循环直到满足 Must-Have / Mustn't-Have 约束，或达到最大迭代次数。
        """
        # 构建初始 prompt
        evidence_text = "\n\n".join([
            f"[Evidence {i+1}] (score: {ev.similarity_score:.2f})\n{ev.text}"
            for i, ev in enumerate(evidence_sentences[:10])  # 只取前 10 条
        ])

        base_prompt = f"""
{bridge.prompt}

【用户意图】
{user_intent}

【Evidence（已筛选）】
{evidence_text}

【必须包含的关键词（Must-Have）】
{', '.join(must_have)}

【禁止出现的关键词（Mustn't-Have）】
{', '.join(mustnt_have)}

请严格按照上述要求生成草稿。
"""

        draft_text = None
        validation_result = None

        for iteration in range(max_iterations):
            # Step 4: Polish（调用 LLM）
            if iteration == 0:
                prompt = base_prompt
            else:
                # 后续迭代：附带上一版 + 缺失/违规列表
                feedback = self._build_feedback(validation_result)
                prompt = f"""
{base_prompt}

【上一版草稿】
{draft_text}

【反馈】
{feedback}

请根据反馈修正草稿。
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

            # 如果通过验证，返回
            if validation_result.passed:
                return draft_text

        # 达到最大迭代次数，返回最后一版（即使未完全通过）
        return draft_text

    def _build_feedback(self, validation_result: ValidationResult) -> str:
        """构建反馈信息（用于 LLM 重新生成）"""
        feedback_parts = []

        if validation_result.missing_must_have:
            feedback_parts.append(
                f"❌ 缺少以下 Must-Have 关键词：{', '.join(validation_result.missing_must_have)}"
            )

        if validation_result.violated_mustnt_have:
            feedback_parts.append(
                f"❌ 出现了禁止的 Mustn't-Have 关键词：{', '.join(validation_result.violated_mustnt_have)}"
            )

        return "\n".join(feedback_parts)
