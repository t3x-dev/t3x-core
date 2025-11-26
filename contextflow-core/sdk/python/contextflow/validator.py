"""ContextFlow Schema Validator"""

import json
from importlib import resources
from pathlib import Path
from typing import Any, Dict, List, Optional
from jsonschema import Draft202012Validator


class ValidationError:
    def __init__(self, path: str, message: str):
        self.path = path
        self.message = message

    def __repr__(self):
        return f"ValidationError(path='{self.path}', message='{self.message}')"


class ValidationResult:
    def __init__(self, valid: bool, errors: Optional[List[ValidationError]] = None):
        self.valid = valid
        self.errors = errors or []

    def __bool__(self):
        return self.valid

    def __repr__(self):
        if self.valid:
            return "ValidationResult(valid=True)"
        return f"ValidationResult(valid=False, errors={len(self.errors)})"


class ContextFlowValidator:
    """Validator for ContextFlow files against JSON Schema"""

    def __init__(self, schema_path: Optional[str] = None):
        if schema_path is None:
            self.schema = self._load_default_schema()
        else:
            path = Path(schema_path)
            with path.open("r", encoding="utf-8") as f:
                self.schema = json.load(f)

        self.validator = Draft202012Validator(self.schema)

    def _load_default_schema(self) -> Dict[str, Any]:
        """Load schema from repository checkout or bundled package data."""
        repo_schema = Path(__file__).resolve().parents[3] / "schema" / "v1.0.json"
        if repo_schema.exists():
            with repo_schema.open("r", encoding="utf-8") as f:
                return json.load(f)

        try:
            schema_resource = resources.files("contextflow").joinpath(
                "schema/v1.0.json"
            )
        except ModuleNotFoundError as exc:
            raise FileNotFoundError(
                "ContextFlow schema not found. Provide schema_path explicitly."
            ) from exc

        if schema_resource.is_file():
            with schema_resource.open("r", encoding="utf-8") as f:
                return json.load(f)

        raise FileNotFoundError(
            "Bundled ContextFlow schema is missing. Provide schema_path explicitly."
        )

    def validate_artifact(self, data: Dict[str, Any]) -> ValidationResult:
        """Validate ContextFlow data against schema"""
        errors = []

        for error in self.validator.iter_errors(data):
            path = "/" + "/".join(str(p) for p in error.path)
            errors.append(ValidationError(path=path, message=error.message))

        if errors:
            return ValidationResult(valid=False, errors=errors)

        return ValidationResult(valid=True)

    def validate_file(self, file_path: str) -> ValidationResult:
        """Validate ContextFlow file against schema"""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        return self.validate_artifact(data)


def validate(data: Dict[str, Any]) -> ValidationResult:
    """Convenience function to validate ContextFlow data"""
    validator = ContextFlowValidator()
    return validator.validate_artifact(data)


def validate_file(file_path: str) -> ValidationResult:
    """Convenience function to validate ContextFlow file"""
    validator = ContextFlowValidator()
    return validator.validate_file(file_path)
