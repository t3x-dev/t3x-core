"""Tests for example ContextFlow files

This ensures all example .contextflow files in the repository are valid.
"""

import pytest
import json
from pathlib import Path
from contextflow.validator import ContextFlowValidator


# Find all .contextflow example files
EXAMPLES_DIR = Path(__file__).parent.parent.parent.parent / "examples"
ARTIFACT_FILES = list(EXAMPLES_DIR.glob("*.contextflow"))


class TestExampleFiles:
    """Test that all example ContextFlow files are valid"""

    @pytest.fixture(scope="class")
    def validator(self):
        """Create validator instance"""
        return ContextFlowValidator()

    @pytest.mark.parametrize("artifact_file", ARTIFACT_FILES, ids=[f.name for f in ARTIFACT_FILES])
    def test_example_file_is_valid(self, validator, artifact_file):
        """Test that example ContextFlow file is valid"""
        result = validator.validate_file(str(artifact_file))

        if not result.valid:
            print(f"\n❌ Validation errors in {artifact_file.name}:")
            for error in result.errors:
                print(f"  {error.path}: {error.message}")

        assert result.valid, f"{artifact_file.name} is not valid"

    @pytest.mark.parametrize("artifact_file", ARTIFACT_FILES, ids=[f.name for f in ARTIFACT_FILES])
    def test_example_file_has_required_fields(self, artifact_file):
        """Test that example has required fields"""
        with open(artifact_file) as f:
            data = json.load(f)

        # Check required fields
        assert "contextflow_version" in data, f"{artifact_file.name} missing contextflow_version"
        assert data["contextflow_version"] == "1.0", f"{artifact_file.name} has wrong contextflow_version"

        assert "metadata" in data, f"{artifact_file.name} missing metadata"
        assert "created" in data["metadata"], f"{artifact_file.name} missing metadata.created"

    @pytest.mark.parametrize("artifact_file", ARTIFACT_FILES, ids=[f.name for f in ARTIFACT_FILES])
    def test_example_file_is_pretty_printed(self, artifact_file):
        """Test that example files are formatted consistently"""
        with open(artifact_file) as f:
            content = f.read()

        # Should be pretty-printed JSON (contains newlines and indentation)
        assert "\n" in content, f"{artifact_file.name} not pretty-printed"
        assert "  " in content, f"{artifact_file.name} not indented"

        # Should be valid JSON
        try:
            json.loads(content)
        except json.JSONDecodeError as e:
            pytest.fail(f"{artifact_file.name} is not valid JSON: {e}")


class TestSpecificExamples:
    """Test specific example files for expected content"""

    def test_basic_context_example(self):
        """Test basic-context.contextflow has expected structure"""
        basic_file = EXAMPLES_DIR / "basic-context.contextflow"
        if not basic_file.exists():
            pytest.skip("basic-context.contextflow not found")

        with open(basic_file) as f:
            data = json.load(f)

        # Should be minimal example
        assert data["contextflow_version"] == "1.0"
        assert "metadata" in data

    def test_with_conversations_example(self):
        """Test with-conversations.contextflow has conversations"""
        conv_file = EXAMPLES_DIR / "with-conversations.contextflow"
        if not conv_file.exists():
            pytest.skip("with-conversations.contextflow not found")

        with open(conv_file) as f:
            data = json.load(f)

        # Should have conversations
        assert "conversations" in data
        assert len(data["conversations"]) > 0

        # Each conversation should have messages
        for conv in data["conversations"]:
            assert "messages" in conv
            assert len(conv["messages"]) > 0

    def test_with_api_metadata_example(self):
        """Test with-api-metadata.contextflow has API metadata"""
        api_file = EXAMPLES_DIR / "with-api-metadata.contextflow"
        if not api_file.exists():
            pytest.skip("with-api-metadata.contextflow not found")

        with open(api_file) as f:
            data = json.load(f)

        # Should have conversations with API metadata
        assert "conversations" in data
        found_api_metadata = False

        for conv in data["conversations"]:
            for msg in conv.get("messages", []):
                if "api_call" in msg:
                    found_api_metadata = True
                    # Verify API call structure
                    api_call = msg["api_call"]
                    assert "provider" in api_call
                    assert "model" in api_call
                    break

        assert found_api_metadata, "No API metadata found in example"

    def test_branch_and_semantic_metadata_present(self):
        """Ensure advanced lineage and semantic metadata exist in prompt lineage example"""
        lineage_file = EXAMPLES_DIR / "with-prompt-lineage.contextflow"
        if not lineage_file.exists():
            pytest.skip("with-prompt-lineage.contextflow not found")

        with open(lineage_file) as f:
            data = json.load(f)

        metadata = data.get("metadata", {})
        tooling = data.get("_tooling", {})
        usage_summary = data.get("usage_summary", {})

        assert metadata.get("branch") == "main"
        signature = metadata.get("signature")
        assert signature is not None
        assert signature.get("status") == "verified"

        lineage = tooling.get("lineage", {})
        assert lineage.get("current_branch") == "main"
        assert "merges" in lineage and lineage["merges"], "Expected merges recorded in lineage metadata"
        first_merge = lineage["merges"][0]
        assert first_merge["strategy"] == "three-way"
        assert first_merge["status"] == "completed"

        semantic = tooling.get("semantic", {})
        assert semantic.get("extractor", {}).get("type") == "spacy"
        assert semantic.get("validator", {}).get("type") == "minilm"

        last_diff = usage_summary.get("last_diff")
        assert last_diff is not None
        assert last_diff.get("from_commit") == "commit-7ab4c210"
        operations = usage_summary.get("operations")
        assert operations and any(op["name"] == "merge" for op in operations)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
