from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Mapping

from .errors import Divergence, PROTOCOL_ERROR_CODES, ProtocolError
from .json_io import load_metadata_json, load_protocol_json
from .protocol import (
    CONFORMANCE_DRIVER_NAME,
    ConformanceStringDriver,
    IndependentVerifier,
    ProtocolKernel,
    Resolver,
)


class ConformanceSuite:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root.resolve()
        self.protocol_root = self.repo_root / "packages/transition"
        self.conformance_root = self.protocol_root / "conformance/v1"
        schema = load_metadata_json(self.protocol_root / "schema/transition-v1.schema.json")
        self.kernel = ProtocolKernel(schema)
        self.manifest = load_metadata_json(self.conformance_root / "manifest.json")

    def _vectors(self, name: str) -> Any:
        relative = self.manifest["vectors"][name]
        return load_protocol_json(self.conformance_root / relative)

    @staticmethod
    def _assert_unique(vectors: list[Mapping[str, Any]], vector_file: str) -> None:
        identifiers = [vector["id"] for vector in vectors]
        if len(identifiers) != len(set(identifiers)):
            raise Divergence(vector_file, "<catalog>", "parse", "unique ids", identifiers)

    def verify_schema_vectors(self) -> int:
        valid = self._vectors("valid")
        invalid = self._vectors("invalid")
        self._assert_unique(valid, "valid.json")
        self._assert_unique(invalid, "invalid.json")
        for vector in valid:
            try:
                self.kernel.validate_object(vector["value"])
            except ProtocolError as error:
                raise Divergence(
                    "valid.json", vector["id"], error.stage, "accepted", error.code
                ) from error
        for vector in invalid:
            try:
                self.kernel.validate_object(vector["value"])
            except ProtocolError as error:
                if error.code != vector["expectedCode"]:
                    raise Divergence(
                        "invalid.json",
                        vector["id"],
                        error.stage,
                        vector["expectedCode"],
                        error.code,
                    ) from error
            else:
                raise Divergence(
                    "invalid.json", vector["id"], "schema", vector["expectedCode"], "accepted"
                )
        return len(valid) + len(invalid)

    def verify_canonical_vectors(self) -> int:
        vectors = self._vectors("canonical")
        self._assert_unique(vectors, "canonical.json")
        for vector in vectors:
            actual = self.kernel.canonical_bytes(vector["value"])
            expected = vector["canonical"].encode()
            if actual != expected:
                raise Divergence(
                    "canonical.json",
                    vector["id"],
                    "canonical",
                    vector["canonical"],
                    actual.decode(errors="replace"),
                    expected.hex(),
                    actual.hex(),
                )
        return len(vectors)

    def verify_identity_vectors(self) -> int:
        vectors = self._vectors("identity")
        self._assert_unique(vectors, "identity.json")
        for vector in vectors:
            actual_bytes = self.kernel.canonical_bytes(vector["value"])
            expected_bytes = vector["canonical"].encode()
            if actual_bytes != expected_bytes:
                raise Divergence(
                    "identity.json",
                    vector["id"],
                    "canonical",
                    vector["canonical"],
                    actual_bytes.decode(errors="replace"),
                    expected_bytes.hex(),
                    actual_bytes.hex(),
                )
            actual = self.kernel.descriptor(vector["value"])["digest"]
            if actual != vector["digest"]:
                raise Divergence(
                    "identity.json", vector["id"], "digest", vector["digest"], actual
                )
        return len(vectors)

    def verify_semantic_catalog(self) -> int:
        vectors = self._vectors("semantic")
        self._assert_unique(vectors, "semantic.json")
        for vector in vectors:
            expectations = [key for key in ("expected", "expectedCode") if key in vector]
            if len(expectations) != 1:
                raise Divergence(
                    "semantic.json", vector["id"], "parse", "one expectation", expectations
                )
            if "expectedCode" in vector and vector["expectedCode"] not in PROTOCOL_ERROR_CODES:
                raise Divergence(
                    "semantic.json",
                    vector["id"],
                    "parse",
                    "known protocol error code",
                    vector["expectedCode"],
                )
        return len(vectors)

    def verify_execution_vectors(self) -> int:
        corpus = self._vectors("execution")
        if corpus["schema"] != "t3x/transition-execution/v1":
            raise Divergence(
                "execution.json",
                "<catalog>",
                "parse",
                "t3x/transition-execution/v1",
                corpus["schema"],
            )
        cases = corpus["cases"]
        self._assert_unique(cases, "execution.json")

        driver_data = corpus["conformanceDriver"]
        expected_reference = {
            "protocol": driver_data["spec"]["protocol"],
            "protocolVersion": driver_data["spec"]["protocolVersion"],
        }
        actual_reference = {
            "protocol": driver_data["ref"]["protocol"],
            "protocolVersion": driver_data["ref"]["protocolVersion"],
        }
        if actual_reference != expected_reference:
            raise Divergence(
                "execution.json",
                "<driver-spec>",
                "schema",
                expected_reference,
                actual_reference,
            )
        spec_bytes = self.kernel.canonical_bytes(driver_data["spec"])
        prefix = f"{driver_data['specDigestDomain']}\0".encode()
        actual_spec_digest = f"sha256:{hashlib.sha256(prefix + spec_bytes).hexdigest()}"
        if actual_spec_digest != driver_data["ref"]["specDigest"]:
            raise Divergence(
                "execution.json",
                "<driver-spec>",
                "digest",
                driver_data["ref"]["specDigest"],
                actual_spec_digest,
            )

        for vector in cases:
            resolver = Resolver(self.kernel, vector["objects"])
            drivers = []
            if vector["drivers"]:
                if vector["drivers"] != [CONFORMANCE_DRIVER_NAME]:
                    raise Divergence(
                        "execution.json",
                        vector["id"],
                        "replay",
                        [CONFORMANCE_DRIVER_NAME],
                        vector["drivers"],
                    )
                drivers.append(ConformanceStringDriver(driver_data))
            verifier = IndependentVerifier(self.kernel, resolver, drivers)

            try:
                subject = resolver.resolve(vector["subject"])
                actual: Mapping[str, Any]
                if vector["operation"] == "resolve":
                    actual = {"status": "verified"}
                elif vector["operation"] == "verify_effect":
                    actual = {
                        "status": "verified",
                        "result": verifier.verify_effect(subject),
                    }
                elif vector["operation"] == "verify_commit":
                    verifier.verify_commit(subject)
                    actual = {"status": "verified"}
                else:
                    raise ProtocolError(
                        "UNSUPPORTED_SEMANTICS", "unknown execution operation", stage="replay"
                    )
            except ProtocolError as error:
                actual = {"errorCode": error.code}
            if actual != vector["expected"]:
                stage = "replay" if vector["operation"] == "verify_effect" else "integrity"
                raise Divergence(
                    "execution.json", vector["id"], stage, vector["expected"], actual
                )
        return len(cases)

    def run(self) -> dict[str, int]:
        return {
            "schema": self.verify_schema_vectors(),
            "canonical": self.verify_canonical_vectors(),
            "identity": self.verify_identity_vectors(),
            "semantic": self.verify_semantic_catalog(),
            "execution": self.verify_execution_vectors(),
        }
