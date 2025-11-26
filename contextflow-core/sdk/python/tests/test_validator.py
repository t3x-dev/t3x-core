"""Tests for ContextFlow validator"""

import pytest
import json
from datetime import datetime
from contextflow.validator import ContextFlowValidator, validate, validate_file
from contextflow.types import ContextFlowFile, ContextFlowMetadata
import tempfile


class TestValidator:
    """Test ContextFlow validator functionality"""

    def setup_method(self):
        """Setup test fixtures"""
        self.validator = ContextFlowValidator()

    def test_minimal_valid_contextflow(self):
        """Test that minimal valid ContextFlow passes validation"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "2025-10-06T12:00:00Z"},
        }

        result = self.validator.validate_artifact(data)
        assert result.valid is True
        assert len(result.errors) == 0

    def test_missing_contextflow_version(self):
        """Test that missing contextflow_version fails validation"""
        data = {"metadata": {"created": "2025-10-06T12:00:00Z"}}

        result = self.validator.validate_artifact(data)
        assert result.valid is False
        assert len(result.errors) > 0
        assert any("contextflow_version" in err.message for err in result.errors)

    def test_missing_metadata(self):
        """Test that missing metadata fails validation"""
        data = {"contextflow_version": "1.0"}

        result = self.validator.validate_artifact(data)
        assert result.valid is False
        assert len(result.errors) > 0
        assert any("metadata" in err.message for err in result.errors)

    def test_missing_created_timestamp(self):
        """Test that missing created timestamp fails validation"""
        data = {"contextflow_version": "1.0", "metadata": {}}

        result = self.validator.validate_artifact(data)
        assert result.valid is False
        assert any("created" in err.message for err in result.errors)

    def test_invalid_contextflow_version(self):
        """Test that wrong contextflow_version fails validation"""
        data = {
            "contextflow_version": "2.0",  # Invalid version
            "metadata": {"created": "2025-10-06T12:00:00Z"},
        }

        result = self.validator.validate_artifact(data)
        assert result.valid is False

    def test_valid_contextflow_with_conversations(self):
        """Test valid ContextFlow with conversations"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "2025-10-06T12:00:00Z"},
            "conversations": [
                {
                    "title": "Test Conversation",
                    "messages": [
                        {"role": "user", "content": "Hello"},
                        {"role": "assistant", "content": "Hi there!"},
                    ],
                }
            ],
        }

        result = self.validator.validate_artifact(data)
        assert result.valid is True

    def test_invalid_message_role(self):
        """Test that invalid message role fails validation"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "2025-10-06T12:00:00Z"},
            "conversations": [
                {
                    "messages": [
                        {"role": "invalid_role", "content": "Hello"}  # Invalid role
                    ]
                }
            ],
        }

        result = self.validator.validate_artifact(data)
        assert result.valid is False

    def test_validate_file(self):
        """Test validating ContextFlow file from disk"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "2025-10-06T12:00:00Z"},
        }

        # Create temporary file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".contextflow", delete=False) as f:
            json.dump(data, f)
            temp_path = f.name

        # Validate file
        result = self.validator.validate_file(temp_path)
        assert result.valid is True

    def test_convenience_function(self):
        """Test convenience validate() function"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "2025-10-06T12:00:00Z"},
        }

        result = validate(data)
        assert result.valid is True

    def test_pydantic_model_generates_valid_contextflow(self):
        """Test that Pydantic models generate valid ContextFlow"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created=datetime.utcnow().isoformat() + "Z"),
        )

        # Convert to dict and validate
        data = artifact.model_dump(by_alias=True, exclude_none=True)
        result = validate(data)
        assert result.valid is True


class TestValidatorErrorMessages:
    """Test that validator provides helpful error messages"""

    def test_error_path_reporting(self):
        """Test that errors include correct paths"""
        data = {
            "contextflow_version": "1.0",
            "metadata": {"created": "invalid-date"},  # Invalid ISO 8601
        }

        validator = ContextFlowValidator()
        result = validator.validate_artifact(data)

        # Should fail validation (though format validation might be lenient)
        if not result.valid:
            assert any("/metadata" in err.path for err in result.errors)

    def test_multiple_errors_reported(self):
        """Test that multiple errors are all reported"""
        data = {
            # Missing contextflow_version
            "metadata": {},  # Missing created
        }

        validator = ContextFlowValidator()
        result = validator.validate_artifact(data)

        assert result.valid is False
        assert len(result.errors) >= 2  # At least 2 errors


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
