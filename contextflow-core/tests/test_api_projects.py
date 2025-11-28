"""
Tests for project management API endpoints
"""

import pytest
from fastapi.testclient import TestClient

from core_api.app import app
from core_api.database import init_database


@pytest.fixture
def client():
    """Create test client with fresh database"""
    init_database()
    with TestClient(app) as client:
        yield client


class TestProjectCRUD:
    """Test project CRUD operations"""

    def test_create_project(self, client):
        """Test creating a new project"""
        response = client.post(
            "/api/v1/projects",
            json={"name": "Test Project", "metadata": {"description": "Test description"}}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["name"] == "Test Project"
        assert data["data"]["project_id"].startswith("proj_")

    def test_list_projects(self, client):
        """Test listing projects"""
        # Create a project first
        client.post("/api/v1/projects", json={"name": "Project 1"})
        client.post("/api/v1/projects", json={"name": "Project 2"})

        response = client.get("/api/v1/projects")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert len(data["data"]) >= 2

    def test_get_project(self, client):
        """Test getting a specific project"""
        # Create a project
        create_response = client.post("/api/v1/projects", json={"name": "Get Test"})
        project_id = create_response.json()["data"]["project_id"]

        # Get the project
        response = client.get(f"/api/v1/projects/{project_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["name"] == "Get Test"
        assert "stats" in data["data"]

    def test_get_nonexistent_project(self, client):
        """Test getting a project that doesn't exist"""
        response = client.get("/api/v1/projects/nonexistent_id")
        assert response.status_code == 404


class TestProjectDelete:
    """Test project deletion"""

    def test_delete_project(self, client):
        """Test deleting a project"""
        # Create a project
        create_response = client.post("/api/v1/projects", json={"name": "Delete Test"})
        project_id = create_response.json()["data"]["project_id"]

        # Delete the project
        response = client.delete(f"/api/v1/projects/{project_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["deleted"] == project_id
        assert data["data"]["name"] == "Delete Test"
        assert "cascade_deleted" in data["data"]

        # Verify project is gone
        get_response = client.get(f"/api/v1/projects/{project_id}")
        assert get_response.status_code == 404

    def test_delete_nonexistent_project(self, client):
        """Test deleting a project that doesn't exist"""
        response = client.delete("/api/v1/projects/nonexistent_id")
        assert response.status_code == 404

    def test_delete_project_cascade(self, client):
        """Test that deleting a project cascades to related data"""
        # Create a project
        create_response = client.post("/api/v1/projects", json={"name": "Cascade Test"})
        project_id = create_response.json()["data"]["project_id"]

        # Create a conversation
        conv_response = client.post(
            "/api/v1/conversations",
            json={"project_id": project_id, "title": "Test Conversation"}
        )
        conv_id = conv_response.json()["data"]["conversation_id"]

        # Create a turn
        client.post(
            "/api/v1/turns",
            json={
                "project_id": project_id,
                "conversation_id": conv_id,
                "role": "user",
                "content": "Hello world"
            }
        )

        # Delete the project
        response = client.delete(f"/api/v1/projects/{project_id}")
        assert response.status_code == 200
        data = response.json()

        # Verify cascade deletion counts
        cascade = data["data"]["cascade_deleted"]
        assert cascade["conversations"] >= 1
        assert cascade["turns"] >= 1

        # Verify conversation is gone
        conv_list = client.get(f"/api/v1/conversations?project_id={project_id}")
        conv_data = conv_list.json()
        # PaginatedResponse returns data as list
        assert conv_data.get("data", []) == []

        # Verify turns are gone
        turns_list = client.get(f"/api/v1/turns?project_id={project_id}")
        turns_data = turns_list.json()
        assert turns_data.get("data", []) == []
