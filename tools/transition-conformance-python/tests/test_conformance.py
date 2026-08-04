from __future__ import annotations

import unittest
from pathlib import Path

from t3x_transition_verifier import ConformanceSuite, ProtocolError
from t3x_transition_verifier.json_io import loads_protocol_json


REPO_ROOT = Path(__file__).resolve().parents[3]


class IndependentConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.suite = ConformanceSuite(REPO_ROOT)

    def test_schema_vectors(self) -> None:
        self.assertGreater(self.suite.verify_schema_vectors(), 0)

    def test_canonical_vectors(self) -> None:
        self.assertGreater(self.suite.verify_canonical_vectors(), 0)

    def test_identity_vectors(self) -> None:
        self.assertGreater(self.suite.verify_identity_vectors(), 0)

    def test_semantic_catalog(self) -> None:
        self.assertGreater(self.suite.verify_semantic_catalog(), 0)

    def test_execution_vectors(self) -> None:
        self.assertGreater(self.suite.verify_execution_vectors(), 0)

    def test_duplicate_json_keys_fail_before_schema_validation(self) -> None:
        with self.assertRaises(ProtocolError) as raised:
            loads_protocol_json('{"schema":"t3x/state/v1","schema":"t3x/state/v1"}')
        self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_lone_unicode_surrogate_is_not_canonical(self) -> None:
        with self.assertRaises(ProtocolError) as raised:
            loads_protocol_json('"\\ud800"')
        self.assertEqual(raised.exception.code, "NON_CANONICAL_VALUE")

    def test_unordered_descriptor_set_is_rejected(self) -> None:
        statement = {
            "schema": "t3x/statement/v1",
            "subjects": [
                {
                    "kind": "state",
                    "schema": "t3x/state/v1",
                    "digest": f"sha256:{'b' * 64}",
                },
                {
                    "kind": "state",
                    "schema": "t3x/state/v1",
                    "digest": f"sha256:{'a' * 64}",
                },
            ],
            "actor": {"kind": "service", "id": "service:test"},
            "predicateType": "t3x.dev/test/v1",
            "predicate": {"valid": True},
        }
        with self.assertRaises(ProtocolError) as raised:
            self.suite.kernel.validate_object(statement)
        self.assertEqual(raised.exception.code, "NON_CANONICAL_VALUE")


if __name__ == "__main__":
    unittest.main()
