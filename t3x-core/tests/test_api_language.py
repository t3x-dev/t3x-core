"""
End-to-end API test: Chinese/English request flow

Tests the Turn API language parameter and automatic language detection functionality.
"""

import pytest
from fastapi.testclient import TestClient

from core_api.app import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def test_project(client):
    """Create test project"""
    resp = client.post("/api/v1/projects", json={"name": f"api-test-project"})
    assert resp.status_code == 200
    return resp.json()["data"]


@pytest.fixture
def test_conversation(client, test_project):
    """Create test conversation"""
    resp = client.post("/api/v1/conversations", json={
        "project_id": test_project["project_id"],
        "title": "API Test Conversation"
    })
    assert resp.status_code == 200
    return resp.json()["data"]


class TestTurnLanguageParameter:
    """Test Turn API language parameter"""

    def test_create_turn_without_language(self, client, test_project, test_conversation):
        """Without language parameter, auto-detect"""
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
        """language=zh forces Chinese"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习",
            "language": "zh"
        })
        assert resp.status_code == 200

    def test_create_turn_with_language_en(self, client, test_project, test_conversation):
        """language=en forces English"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "I want to learn machine learning",
            "language": "en"
        })
        assert resp.status_code == 200

    def test_create_turn_with_language_auto(self, client, test_project, test_conversation):
        """language=auto explicit auto-detection"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "推荐资源:Coursera",
            "language": "auto"
        })
        assert resp.status_code == 200

    def test_create_turn_invalid_language(self, client, test_project, test_conversation):
        """Invalid language value should return 422"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "test",
            "language": "invalid"
        })
        assert resp.status_code == 422


class TestChineseRingExtraction:
    """Test Ring extraction for Chinese content"""

    @pytest.mark.skip(reason="ring_snapshot not yet integrated into turns API")
    def test_chinese_ring_extraction(self, client, test_project, test_conversation):
        """Test Chinese content Ring 1/2/3 extraction"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我想学习机器学习,尤其是深度学习和神经网络.",
            "language": "zh"
        })
        assert resp.status_code == 200
        turn = resp.json()["data"]

        # Verify Ring 1/2/3 snapshot exists
        ring_snapshot = turn.get("ring_snapshot")
        assert ring_snapshot is not None

        # Check Ring 1: Keywords
        ring1 = ring_snapshot.get("ring1")
        assert ring1 is not None
        assert "keywords" in ring1
        assert len(ring1["keywords"]) > 0

        # Check Ring 2: Facets
        ring2 = ring_snapshot.get("ring2")
        assert ring2 is not None

        # Check Ring 3: Segments
        ring3 = ring_snapshot.get("ring3")
        assert ring3 is not None


class TestEnglishRingExtraction:
    """Test Ring extraction for English content"""

    @pytest.mark.skip(reason="ring_snapshot not yet integrated into turns API")
    def test_english_ring_extraction(self, client, test_project, test_conversation):
        """Test English content Ring 1/2/3 extraction"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "I want to learn machine learning, especially deep learning and neural networks.",
            "language": "en"
        })
        assert resp.status_code == 200
        turn = resp.json()["data"]

        # Verify Ring 1/2/3 snapshot exists
        ring_snapshot = turn.get("ring_snapshot")
        assert ring_snapshot is not None

        # Check Ring 1: Keywords
        ring1 = ring_snapshot.get("ring1")
        assert ring1 is not None
        assert "keywords" in ring1
        assert len(ring1["keywords"]) > 0


class TestMixedLanguageSupport:
    """Test mixed language support"""

    @pytest.mark.skip(reason="ring_snapshot not yet integrated into turns API")
    def test_chinese_english_mixed(self, client, test_project, test_conversation):
        """Test Chinese-English mixed content"""
        resp = client.post("/api/v1/turns", json={
            "project_id": test_project["project_id"],
            "conversation_id": test_conversation["conversation_id"],
            "role": "user",
            "content": "我推荐 PyTorch 和 TensorFlow 框架来学习 deep learning.",
            "language": "auto"
        })
        assert resp.status_code == 200
        turn = resp.json()["data"]

        # Verify extraction still works
        ring_snapshot = turn.get("ring_snapshot")
        assert ring_snapshot is not None
