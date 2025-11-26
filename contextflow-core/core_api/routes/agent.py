"""
Agent 端点（Draft API）

POST /api/v1/agent/drafts - 创建 Draft
GET /api/v1/agent/drafts/{draft_id} - 获取 Draft
PATCH /api/v1/agent/drafts/{draft_id} - 更新 Draft
"""

from __future__ import annotations

import json
import sqlite3
import uuid
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends

from core_api.dependencies import get_db
from core_api.schemas import (
    DraftCreate,
    DraftUpdate,
    DraftResponse,
    DraftValidation,
    LLMConfig,
    APIResponse,
)
from core_api.errors import (
    project_not_found,
    conversation_not_found,
    ValidationError,
    ErrorCode,
)

router = APIRouter()


def utc_now_iso() -> str:
    """返回 UTC 时间戳"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_draft_id() -> str:
    """生成 Draft ID"""
    return f"draft_{uuid.uuid4().hex[:8]}"


def extract_must_have_from_turns(cursor, project_id: str, conversation_id: str) -> list[str]:
    """
    从对话的 turns 中提取 must_have 关键词
    """
    rows = cursor.execute(
        """
        SELECT rings_json FROM turns
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
        """,
        (project_id, conversation_id)
    ).fetchall()

    keywords = []
    for row in rows:
        if row["rings_json"]:
            rings = json.loads(row["rings_json"])
            ring1 = rings.get("ring1", {})
            # 提取正向偏好关键词
            for pref in ring1.get("preference_keywords", []):
                if pref.get("polarity") == "positive":
                    kw = pref.get("keyword") or pref.get("lemma")
                    if kw and kw not in keywords:
                        keywords.append(kw)
            # 提取普通关键词
            for kw in ring1.get("keywords", []):
                if kw not in keywords:
                    keywords.append(kw)

    return keywords[:20]  # 限制数量


def extract_mustnt_have_from_turns(cursor, project_id: str, conversation_id: str) -> list[str]:
    """
    从对话的 turns 中提取 mustnt_have 关键词
    """
    rows = cursor.execute(
        """
        SELECT rings_json FROM turns
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
        """,
        (project_id, conversation_id)
    ).fetchall()

    keywords = []
    for row in rows:
        if row["rings_json"]:
            rings = json.loads(row["rings_json"])
            ring1 = rings.get("ring1", {})
            # 提取负向偏好关键词
            for pref in ring1.get("preference_keywords", []):
                if pref.get("polarity") == "negative":
                    kw = pref.get("keyword") or pref.get("lemma")
                    if kw and kw not in keywords:
                        keywords.append(kw)

    return keywords[:10]


def validate_draft_text(text: str, must_have: list[str], mustnt_have: list[str]) -> DraftValidation:
    """
    验证 draft 文本是否满足约束
    """
    text_lower = text.lower()

    missing = [kw for kw in must_have if kw.lower() not in text_lower]
    forbidden = [kw for kw in mustnt_have if kw.lower() in text_lower]

    return DraftValidation(
        passed=len(missing) == 0 and len(forbidden) == 0,
        missing_keywords=missing,
        forbidden_keywords=forbidden
    )


async def call_llm(
    prompt: str,
    llm_config: LLMConfig,
    system_prompt: str = ""
) -> str:
    """
    调用 LLM 生成文本

    支持 Anthropic 和 OpenAI 两种 provider
    """
    provider = llm_config.provider.lower()

    if provider == "anthropic":
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

            message = client.messages.create(
                model=llm_config.model,
                max_tokens=llm_config.max_tokens,
                temperature=llm_config.temperature,
                system=system_prompt if system_prompt else "You are a helpful assistant.",
                messages=[{"role": "user", "content": prompt}]
            )
            return message.content[0].text

        except ImportError:
            raise ValidationError(
                ErrorCode.INTERNAL_ERROR,
                "anthropic library not installed",
                {"hint": "pip install anthropic"}
            )
        except Exception as e:
            raise ValidationError(
                ErrorCode.INTERNAL_ERROR,
                f"Anthropic API error: {str(e)}",
                {"provider": "anthropic"}
            )

    elif provider == "openai":
        try:
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = client.chat.completions.create(
                model=llm_config.model,
                messages=messages,
                max_tokens=llm_config.max_tokens,
                temperature=llm_config.temperature
            )
            return response.choices[0].message.content

        except ImportError:
            raise ValidationError(
                ErrorCode.INTERNAL_ERROR,
                "openai library not installed",
                {"hint": "pip install openai"}
            )
        except Exception as e:
            raise ValidationError(
                ErrorCode.INTERNAL_ERROR,
                f"OpenAI API error: {str(e)}",
                {"provider": "openai"}
            )

    else:
        raise ValidationError(
            ErrorCode.VALIDATION_FAILED,
            f"Unsupported LLM provider: {provider}",
            {"supported": ["anthropic", "openai"]}
        )


def build_bridge_prompt(
    bridge_id: str,
    intent: str,
    context_turns: list[dict],
    must_have: list[str],
    mustnt_have: list[str]
) -> tuple[str, str]:
    """
    根据 bridge_id 构建 prompt

    返回 (system_prompt, user_prompt)
    """
    # 构建对话上下文
    context_text = ""
    for turn in context_turns[-10:]:  # 最多取最近 10 条
        role = turn["role"]
        content = turn["content"][:500]  # 截断过长内容
        context_text += f"\n[{role}]: {content}"

    # Must-Have / Mustn't-Have 约束
    constraints = ""
    if must_have:
        constraints += f"\n\n**Must Include**: {', '.join(must_have[:10])}"
    if mustnt_have:
        constraints += f"\n\n**Must Avoid**: {', '.join(mustnt_have[:5])}"

    # 根据 bridge_id 选择模板
    if bridge_id == "plan":
        system_prompt = "You are a planning assistant. Create structured, actionable plans based on user requirements."
        user_prompt = f"""Based on the following conversation context, create a plan for: {intent}

**Conversation Context**:{context_text}
{constraints}

Please provide a clear, structured plan with specific steps. Format as markdown."""

    elif bridge_id == "summary":
        system_prompt = "You are a summarization assistant. Create concise, accurate summaries."
        user_prompt = f"""Summarize the following conversation with focus on: {intent}

**Conversation Context**:{context_text}
{constraints}

Provide a concise summary highlighting key points. Format as markdown."""

    elif bridge_id == "explain":
        system_prompt = "You are an explanation assistant. Provide clear, detailed explanations."
        user_prompt = f"""Based on the conversation context, explain: {intent}

**Conversation Context**:{context_text}
{constraints}

Provide a clear explanation. Format as markdown."""

    elif bridge_id == "clarify":
        system_prompt = "You are a clarification assistant. Help identify and resolve ambiguities."
        user_prompt = f"""Based on the conversation context, clarify: {intent}

**Conversation Context**:{context_text}
{constraints}

Identify any ambiguities and provide clarification. Format as markdown."""

    else:
        system_prompt = "You are a helpful assistant."
        user_prompt = f"""Intent: {intent}

Context:{context_text}
{constraints}"""

    return system_prompt, user_prompt


@router.post("", response_model=APIResponse)
async def create_draft(
    draft: DraftCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    创建 Draft（基于 Bridge 模板 + LLM 生成）

    同步执行流程：
    1. 提取 Must-Have/Mustn't-Have 约束
    2. 构建 Bridge prompt
    3. 调用 LLM 生成文本
    4. 验证约束
    5. 如果验证失败，重试最多 3 次
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (draft.project_id,)
    ).fetchone()
    if not project:
        raise project_not_found(draft.project_id)

    # 检查对话是否存在
    conversation = cursor.execute(
        "SELECT 1 FROM conversations WHERE conversation_id = ? AND project_id = ?",
        (draft.conversation_id, draft.project_id)
    ).fetchone()
    if not conversation:
        raise conversation_not_found(draft.conversation_id)

    # 获取对话的 turns 作为上下文
    turns = cursor.execute(
        """
        SELECT role, content FROM turns
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
        """,
        (draft.project_id, draft.conversation_id)
    ).fetchall()

    context_turns = [{"role": t["role"], "content": t["content"]} for t in turns]

    # 提取约束
    must_have = extract_must_have_from_turns(cursor, draft.project_id, draft.conversation_id)
    mustnt_have = extract_mustnt_have_from_turns(cursor, draft.project_id, draft.conversation_id)

    # 使用默认 LLM 配置或用户提供的配置
    llm_config = draft.llm_config or LLMConfig()

    # 构建 prompt
    system_prompt, user_prompt = build_bridge_prompt(
        draft.bridge_id,
        draft.intent,
        context_turns,
        must_have,
        mustnt_have
    )

    # 生成 Draft
    draft_id = generate_draft_id()
    created_at = utc_now_iso()

    # 尝试生成并验证，最多重试 3 次
    max_retries = 3
    generated_text = ""
    validation = None

    for attempt in range(max_retries):
        # 调用 LLM
        generated_text = await call_llm(user_prompt, llm_config, system_prompt)

        # 验证
        validation = validate_draft_text(generated_text, must_have, mustnt_have)

        if validation.passed:
            break

        # 如果验证失败，添加提示重试
        if attempt < max_retries - 1:
            retry_hint = f"\n\nPrevious attempt failed validation. Missing keywords: {validation.missing_keywords}. Please include them."
            user_prompt += retry_hint

    completed_at = utc_now_iso()
    status = "ready" if validation and validation.passed else "failed"

    # 保存到数据库
    cursor.execute(
        """
        INSERT INTO drafts (
            draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
            bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
            llm_config_json, text, status, created_at, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            draft_id,
            draft.project_id,
            draft.conversation_id,
            draft.base_commit_hash,
            draft.turn_anchor_hash,
            draft.bridge_id,
            json.dumps({"intent": draft.intent}),
            json.dumps(must_have),
            json.dumps(mustnt_have),
            json.dumps({
                "provider": llm_config.provider,
                "model": llm_config.model,
                "temperature": llm_config.temperature,
                "max_tokens": llm_config.max_tokens
            }),
            generated_text,
            status,
            created_at,
            completed_at
        )
    )

    db.commit()

    return APIResponse(
        data=DraftResponse(
            draft_id=draft_id,
            project_id=draft.project_id,
            conversation_id=draft.conversation_id,
            status=status,
            base_commit_hash=draft.base_commit_hash,
            turn_anchor_hash=draft.turn_anchor_hash,
            bridge_id=draft.bridge_id,
            intent=draft.intent,
            text=generated_text,
            must_have=must_have,
            mustnt_have=mustnt_have,
            validation=validation,
            llm_config=llm_config,
            created_at=created_at,
            completed_at=completed_at
        )
    )


@router.get("/{draft_id}", response_model=APIResponse)
async def get_draft(
    draft_id: str,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    获取已创建的 Draft
    """
    cursor = db.cursor()

    row = cursor.execute(
        """
        SELECT draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
               bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
               llm_config_json, text, status, created_at, completed_at
        FROM drafts
        WHERE draft_id = ?
        """,
        (draft_id,)
    ).fetchone()

    if not row:
        raise ValidationError(
            ErrorCode.NOT_FOUND,
            f"Draft not found: {draft_id}",
            {"draft_id": draft_id}
        )

    # 解析 JSON 字段
    bridge_payload = json.loads(row["bridge_payload_json"]) if row["bridge_payload_json"] else {}
    must_have = json.loads(row["must_have_json"]) if row["must_have_json"] else []
    mustnt_have = json.loads(row["mustnt_have_json"]) if row["mustnt_have_json"] else []
    llm_config_data = json.loads(row["llm_config_json"]) if row["llm_config_json"] else {}

    # 重新验证
    validation = validate_draft_text(row["text"] or "", must_have, mustnt_have)

    return APIResponse(
        data=DraftResponse(
            draft_id=row["draft_id"],
            project_id=row["project_id"],
            conversation_id=row["conversation_id"],
            status=row["status"],
            base_commit_hash=row["base_commit_hash"],
            turn_anchor_hash=row["turn_anchor_hash"],
            bridge_id=row["bridge_id"],
            intent=bridge_payload.get("intent", ""),
            text=row["text"],
            must_have=must_have,
            mustnt_have=mustnt_have,
            validation=validation,
            llm_config=LLMConfig(**llm_config_data) if llm_config_data else None,
            created_at=row["created_at"],
            completed_at=row["completed_at"]
        )
    )


@router.patch("/{draft_id}", response_model=APIResponse)
async def update_draft(
    draft_id: str,
    update: DraftUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    更新 Draft（用户反馈后重新生成）
    """
    cursor = db.cursor()

    # 获取现有 draft
    row = cursor.execute(
        """
        SELECT draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
               bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
               llm_config_json, text, status, created_at
        FROM drafts
        WHERE draft_id = ?
        """,
        (draft_id,)
    ).fetchone()

    if not row:
        raise ValidationError(
            ErrorCode.NOT_FOUND,
            f"Draft not found: {draft_id}",
            {"draft_id": draft_id}
        )

    # 解析现有数据
    bridge_payload = json.loads(row["bridge_payload_json"]) if row["bridge_payload_json"] else {}
    must_have = json.loads(row["must_have_json"]) if row["must_have_json"] else []
    mustnt_have = json.loads(row["mustnt_have_json"]) if row["mustnt_have_json"] else []
    llm_config_data = json.loads(row["llm_config_json"]) if row["llm_config_json"] else {}

    # 更新 must_have
    if update.append_must_have:
        for kw in update.append_must_have:
            if kw not in must_have:
                must_have.append(kw)

    # 获取对话上下文（使用 conversation_id 过滤）
    turns = cursor.execute(
        """
        SELECT role, content FROM turns
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
        """,
        (row["project_id"], row["conversation_id"])
    ).fetchall()

    context_turns = [{"role": t["role"], "content": t["content"]} for t in turns]

    # 重新构建 prompt，加入反馈
    intent = bridge_payload.get("intent", "")
    if update.feedback:
        intent = f"{intent}\n\nUser feedback: {update.feedback}"

    llm_config = LLMConfig(**llm_config_data) if llm_config_data else LLMConfig()

    system_prompt, user_prompt = build_bridge_prompt(
        row["bridge_id"],
        intent,
        context_turns,
        must_have,
        mustnt_have
    )

    # 重新生成
    generated_text = await call_llm(user_prompt, llm_config, system_prompt)
    validation = validate_draft_text(generated_text, must_have, mustnt_have)

    completed_at = utc_now_iso()
    status = "ready" if validation.passed else "failed"

    # 更新数据库
    cursor.execute(
        """
        UPDATE drafts
        SET text = ?, status = ?, must_have_json = ?, completed_at = ?,
            bridge_payload_json = ?
        WHERE draft_id = ?
        """,
        (
            generated_text,
            status,
            json.dumps(must_have),
            completed_at,
            json.dumps({"intent": intent}),
            draft_id
        )
    )

    db.commit()

    return APIResponse(
        data=DraftResponse(
            draft_id=draft_id,
            project_id=row["project_id"],
            conversation_id=row["conversation_id"],
            status=status,
            base_commit_hash=row["base_commit_hash"],
            turn_anchor_hash=row["turn_anchor_hash"],
            bridge_id=row["bridge_id"],
            intent=intent,
            text=generated_text,
            must_have=must_have,
            mustnt_have=mustnt_have,
            validation=validation,
            llm_config=llm_config,
            created_at=row["created_at"],
            completed_at=completed_at
        )
    )
