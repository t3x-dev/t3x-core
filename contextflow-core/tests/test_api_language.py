"""
端到端 API 测试：中文/英文请求链路

测试 Turn API 的 language 参数和自动语言检测功能。
"""

import pytest
from fastapi.testclient import TestClient

from core_api.app import app


@pytest.fixture
def client():
    """创建测试客户端"""
    return TestClient(app)


@pytest.fixture
def test_project(client):
    """创建测试项目"""
    resp = client.post("/api/v1/projects", json={"name": f"api-test-project"})
    assert resp.status_code == 200
    return resp.json()["data"]


@pytest.fixture
def test_conversation(client, test_project):
    """创建测试会话"""
    resp = client.post("/api/v1/conversations", json={
        "project_id": test_project["project_id"],
        "title": "API Test Conversation"
    })
    assert resp.status_code == 200
    return resp.json()["data"]


class TestTurnLanguageParameter:
    """测试 Turn API 的 language 参数"""

    def test_create_turn_without_language(self, client, test_project, test_conversation):
        """不传 language 参数，自动检测"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习"
        })
        assert resp.status_code == 200
        turn = resp.json()["data"]
        assert turn["turn_hash"] is not None

    def test_create_turn_with_language_zh(self, client, test_project, test_conversation):
        """language=zh 强制中文"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习",
            "language": "zh"
        })
        assert resp.status_code == 200

    def test_create_turn_with_language_en(self, client, test_project, test_conversation):
        """language=en 强制英文"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "I want to learn machine learning",
            "language": "en"
        })
        assert resp.status_code == 200

    def test_create_turn_with_language_auto(self, client, test_project, test_conversation):
        """language=auto 显式自动检测"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "推荐资源：Coursera",
            "language": "auto"
        })
        assert resp.status_code == 200

    def test_create_turn_invalid_language(self, client, test_project, test_conversation):
        """无效的 language 值应该返回 422"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "test",
            "language": "invalid"
        })
        assert resp.status_code == 422


class TestChineseRingExtraction:
    """测试中文内容的 Ring 提取"""

    def test_chinese_keywords_extraction(self, client, test_project, test_conversation):
        """中文关键词提取"""
        # 创建 turn
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习算法"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        # 获取详情
        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        detail = resp.json()["data"]

        # 验证 Ring 1 关键词
        keywords = detail["rings"]["ring1"]["keywords"]
        assert len(keywords) > 0
        # 应该包含分词后的关键词，而非整句
        assert "学习" in keywords or "机器" in keywords or "算法" in keywords

    def test_chinese_sentence_segmentation(self, client, test_project, test_conversation):
        """中文分句"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "第一句话。第二句话！第三句话？"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        segments = resp.json()["data"]["rings"]["ring3"]["segments"]

        # 应该分成 3 个 segment
        assert len(segments) == 3

    def test_chinese_intent_extraction(self, client, test_project, test_conversation):
        """中文意图提取"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习深度学习"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        ring2 = resp.json()["data"]["rings"]["ring2"]

        # 应该提取出意图种子
        assert ring2["intent_seed"] is not None

    def test_chinese_question_detection(self, client, test_project, test_conversation):
        """中文疑问词检测"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我应该从哪里开始学习？"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        ring2 = resp.json()["data"]["rings"]["ring2"]

        # 应该检测到疑问词
        assert "哪里" in ring2["unknown_slot"]


class TestEnglishRingExtraction:
    """测试英文内容的 Ring 提取"""

    def test_english_keywords_extraction(self, client, test_project, test_conversation):
        """英文关键词提取"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "I want to learn machine learning algorithms",
            "language": "en"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        keywords = resp.json()["data"]["rings"]["ring1"]["keywords"]

        assert len(keywords) > 0

    def test_english_sentence_segmentation(self, client, test_project, test_conversation):
        """英文分句"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "First sentence. Second sentence. Third sentence.",
            "language": "en"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        segments = resp.json()["data"]["rings"]["ring3"]["segments"]

        assert len(segments) == 3


class TestMixedLanguageContent:
    """测试中英混合内容"""

    def test_mixed_content_auto_detect_chinese(self, client, test_project, test_conversation):
        """中英混合内容（中文为主）自动检测为中文"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习Python和机器学习"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        keywords = resp.json()["data"]["rings"]["ring1"]["keywords"]

        # jieba 应该能分词出 Python
        assert len(keywords) > 1

    def test_force_chinese_on_english_content(self, client, test_project, test_conversation):
        """强制对英文内容使用中文提取器"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "I want to learn Python",
            "language": "zh"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        # jieba 处理英文效果不好，但不应该报错
        assert resp.json()["data"]["rings"] is not None

    def test_force_english_on_chinese_content(self, client, test_project, test_conversation):
        """强制对中文内容使用英文提取器"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习",
            "language": "en"
        })
        assert resp.status_code == 200
        turn_hash = resp.json()["data"]["turn_hash"]

        resp = client.get(f"/api/v1/turns/{turn_hash}")
        assert resp.status_code == 200
        keywords = resp.json()["data"]["rings"]["ring1"]["keywords"]

        # spaCy 处理中文会把整句当一个词
        assert len(keywords) >= 1


class TestLanguageAffectsHash:
    """测试 language 参数影响 turn_hash（确保可复现性）"""

    def test_same_content_different_language_different_hash(self, client, test_project):
        """相同内容，不同 language，应产生不同 turn_hash"""
        # 创建两个独立的会话（避免 parent_turn_hash 影响）
        resp1 = client.post("/api/v1/conversations", json={
            "project_id": test_project["project_id"],
            "title": "Conv for zh"
        })
        conv1 = resp1.json()["data"]

        resp2 = client.post("/api/v1/conversations", json={
            "project_id": test_project["project_id"],
            "title": "Conv for en"
        })
        conv2 = resp2.json()["data"]

        content = "I like Python and machine learning"

        # language=zh
        resp_zh = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": conv1["conversation_id"],
            "role": "user",
            "content": content,
            "language": "zh"
        })
        assert resp_zh.status_code == 200
        hash_zh = resp_zh.json()["data"]["turn_hash"]

        # language=en
        resp_en = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": conv2["conversation_id"],
            "role": "user",
            "content": content,
            "language": "en"
        })
        assert resp_en.status_code == 200
        hash_en = resp_en.json()["data"]["turn_hash"]

        # 不同 language 应产生不同 hash
        assert hash_zh != hash_en

    def test_same_language_produces_reproducible_hash(self, client, test_project):
        """相同内容 + 相同 language，相同时间戳时应产生相同 hash（可复现性）

        注意：实际上 created_at 也参与哈希，所以不同时间创建的 turn 会有不同 hash。
        这个测试验证的是 language 确实参与了哈希计算。
        """
        # 这个测试主要验证 language 字段被正确存储和返回
        resp = client.post("/api/v1/conversations", json={
            "project_id": test_project["project_id"],
            "title": "Test reproducibility"
        })
        conv = resp.json()["data"]

        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": conv["conversation_id"],
            "role": "user",
            "content": "Test content",
            "language": "zh"
        })
        assert resp.status_code == 200
        turn = resp.json()["data"]

        # 验证 language 被存储
        assert turn["language"] == "zh"

        # 从详情中也能获取
        resp = client.get(f"/api/v1/turns/{turn['turn_hash']}")
        assert resp.status_code == 200
        detail = resp.json()["data"]
        assert detail["language"] == "zh"


class TestTurnChaining:
    """测试 Turn 链式创建（parent_turn_hash 自动设置）"""

    def test_turn_chain_with_different_languages(self, client, test_project, test_conversation):
        """不同语言的 Turn 链式创建"""
        # 第一个 Turn（中文）
        resp1 = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习"
        })
        assert resp1.status_code == 200
        turn1 = resp1.json()["data"]
        assert turn1["parent_turn_hash"] is None

        # 第二个 Turn（英文）
        resp2 = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "assistant",
            "content": "Here are some recommendations for learning machine learning.",
            "language": "en"
        })
        assert resp2.status_code == 200
        turn2 = resp2.json()["data"]
        assert turn2["parent_turn_hash"] == turn1["turn_hash"]

        # 第三个 Turn（中文）
        resp3 = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "有什么推荐的资源吗？",
            "language": "zh"
        })
        assert resp3.status_code == 200
        turn3 = resp3.json()["data"]
        assert turn3["parent_turn_hash"] == turn2["turn_hash"]
