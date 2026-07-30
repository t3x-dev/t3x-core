from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Mapping
from typing import Any, Protocol

import rfc8785
from jsonschema import Draft202012Validator

from .errors import ProtocolError, ReplayPreconditionFailed
from .json_io import loads_protocol_json


SCHEMA_TO_KIND = {
    "t3x/state/v1": "state",
    "t3x/effect/v1": "effect",
    "t3x/statement/v1": "statement",
    "t3x/commit/v2": "commit",
}
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
CONFORMANCE_DRIVER_NAME = "t3x.conformance/string-replace@1"


def _same_descriptor(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    return all(left.get(key) == right.get(key) for key in ("kind", "schema", "digest"))


def _descriptor_key(descriptor: Mapping[str, Any]) -> str:
    return "\0".join(
        (str(descriptor["kind"]), str(descriptor["schema"]), str(descriptor["digest"]))
    )


def _driver_key(reference: Mapping[str, Any]) -> str:
    return "\0".join(
        (
            str(reference["protocol"]),
            str(reference["protocolVersion"]),
            str(reference["specDigest"]),
        )
    )


def _utf16_key(value: str) -> bytes:
    return value.encode("utf-16-be")


class Driver(Protocol):
    reference: Mapping[str, Any]

    def execute(
        self,
        base: Mapping[str, Any],
        definition: Mapping[str, Any],
        inputs: Mapping[str, Mapping[str, Any]],
    ) -> Mapping[str, Any]: ...


class ProtocolKernel:
    def __init__(self, schema: Mapping[str, Any]) -> None:
        Draft202012Validator.check_schema(schema)
        self.validator = Draft202012Validator(schema)

    def canonical_bytes(self, value: Any) -> bytes:
        try:
            return rfc8785.dumps(value)
        except (rfc8785.CanonicalizationError, UnicodeError, ValueError) as error:
            raise ProtocolError(
                "NON_CANONICAL_VALUE", str(error), stage="canonical"
            ) from error

    def validate_object(self, value: Any) -> Mapping[str, Any]:
        errors = sorted(
            self.validator.iter_errors(value),
            key=lambda error: tuple(str(member) for member in error.absolute_path),
        )
        if errors:
            error = errors[0]
            path = "$" + "".join(f"[{member!r}]" for member in error.absolute_path)
            raise ProtocolError(
                "SCHEMA_INVALID", f"{error.message} at {path}", stage="schema"
            )
        if not isinstance(value, dict):
            raise ProtocolError("SCHEMA_INVALID", "object required", stage="schema")
        self._validate_collections(value)
        return value

    def _strict_canonical_set(self, values: Iterable[Any], path: str) -> None:
        encoded = [self.canonical_bytes(value) for value in values]
        for index in range(1, len(encoded)):
            if encoded[index - 1] >= encoded[index]:
                raise ProtocolError(
                    "NON_CANONICAL_VALUE",
                    f"duplicate or unordered canonical set at {path}",
                    stage="schema",
                )

    def _validate_claim_evidence(self, claim: Any, path: str) -> None:
        if isinstance(claim, dict) and "evidence" in claim:
            self._strict_canonical_set(claim["evidence"], f"{path}.evidence")

    def _validate_collections(self, value: Mapping[str, Any]) -> None:
        if value.get("schema") == "t3x/effect/v1":
            roles = [member["role"] for member in value["inputs"]]
            if roles != sorted(roles, key=_utf16_key) or len(roles) != len(set(roles)):
                raise ProtocolError(
                    "NON_CANONICAL_VALUE",
                    "Effect.inputs roles must be unique and UTF-16 ordered",
                    stage="schema",
                )
        if value.get("schema") != "t3x/statement/v1":
            return
        self._strict_canonical_set(value["subjects"], "Statement.subjects")
        predicate = value["predicate"]
        predicate_type = value["predicateType"]
        if predicate_type == "t3x.proposal/v1":
            self._validate_claim_evidence(predicate["intent"], "Proposal.intent")
            self._validate_claim_evidence(predicate["rationale"], "Proposal.rationale")
        elif predicate_type == "t3x.decision/v1":
            self._strict_canonical_set(predicate["considered"], "Decision.considered")
            self._validate_claim_evidence(predicate["rationale"], "Decision.rationale")

    def parse_protocol_bytes(self, data: bytes | str) -> Mapping[str, Any]:
        return self.validate_object(loads_protocol_json(data))

    def parse_descriptor(self, value: Any) -> Mapping[str, Any]:
        if not isinstance(value, dict) or set(value) != {"kind", "schema", "digest"}:
            raise ProtocolError("SCHEMA_INVALID", "invalid object descriptor", stage="schema")
        kind = value.get("kind")
        schema = value.get("schema")
        digest = value.get("digest")
        if SCHEMA_TO_KIND.get(schema) != kind or not isinstance(digest, str):
            raise ProtocolError("SCHEMA_INVALID", "invalid descriptor kind/schema", stage="schema")
        if DIGEST_PATTERN.fullmatch(digest) is None:
            raise ProtocolError("SCHEMA_INVALID", "malformed descriptor digest", stage="schema")
        return value

    def digest_canonical_bytes(self, kind: str, schema: str, data: bytes) -> str:
        if SCHEMA_TO_KIND.get(schema) != kind:
            raise ProtocolError(
                "UNSUPPORTED_MEDIA_TYPE", "descriptor kind/schema mismatch", stage="digest"
            )
        prefix = f"t3x-object-v1\0{kind}\0{schema}\0".encode()
        return f"sha256:{hashlib.sha256(prefix + data).hexdigest()}"

    def descriptor(self, value: Any) -> Mapping[str, Any]:
        parsed = self.validate_object(value)
        schema = parsed["schema"]
        kind = SCHEMA_TO_KIND[schema]
        digest = self.digest_canonical_bytes(kind, schema, self.canonical_bytes(parsed))
        return {"kind": kind, "schema": schema, "digest": digest}


class Resolver:
    def __init__(self, kernel: ProtocolKernel, resources: Iterable[Mapping[str, Any]]) -> None:
        self.kernel = kernel
        self.objects: dict[str, bytes] = {}
        for resource in resources:
            descriptor = kernel.parse_descriptor(resource["descriptor"])
            data = resource["bytes"].encode("utf-8")
            key = _descriptor_key(descriptor)
            if key in self.objects:
                raise ProtocolError(
                    "INTEGRITY_CHAIN_INVALID", "duplicate resolver entry", stage="resolve"
                )
            self.objects[key] = data

    def resolve(self, requested: Mapping[str, Any]) -> Mapping[str, Any]:
        descriptor = self.kernel.parse_descriptor(requested)
        data = self.objects.get(_descriptor_key(descriptor))
        if data is None:
            raise ProtocolError("OBJECT_NOT_FOUND", "object not found", stage="resolve")
        digest = self.kernel.digest_canonical_bytes(
            descriptor["kind"], descriptor["schema"], data
        )
        if digest != descriptor["digest"]:
            raise ProtocolError(
                "OBJECT_DIGEST_MISMATCH", "resolved bytes digest differs", stage="resolve"
            )
        value = self.kernel.parse_protocol_bytes(data)
        actual = self.kernel.descriptor(value)
        if actual["kind"] != descriptor["kind"] or actual["schema"] != descriptor["schema"]:
            raise ProtocolError(
                "UNSUPPORTED_MEDIA_TYPE", "resolved object kind/schema differs", stage="resolve"
            )
        if actual["digest"] != descriptor["digest"]:
            raise ProtocolError(
                "OBJECT_DIGEST_MISMATCH", "resolved object identity differs", stage="resolve"
            )
        if self.kernel.canonical_bytes(value) != data:
            raise ProtocolError(
                "NON_CANONICAL_VALUE", "resolved bytes are not RFC 8785 canonical", stage="resolve"
            )
        return value


class ConformanceStringDriver:
    def __init__(self, corpus_driver: Mapping[str, Any]) -> None:
        self.reference = corpus_driver["ref"]
        self.codec = corpus_driver["spec"]["stateCodec"]

    def execute(
        self,
        base: Mapping[str, Any],
        definition: Mapping[str, Any],
        inputs: Mapping[str, Mapping[str, Any]],
    ) -> Mapping[str, Any]:
        if base["codec"] != self.codec or not isinstance(base["value"], str):
            raise ProtocolError(
                "UNSUPPORTED_MEDIA_TYPE", "conformance string codec required", stage="replay"
            )
        if definition["inputs"] or inputs:
            raise ProtocolError(
                "UNSUPPORTED_SEMANTICS", "named inputs are unsupported", stage="replay"
            )
        value = base["value"]
        for index, operation in enumerate(definition["operations"]):
            if not isinstance(operation, dict) or set(operation) != {"op", "value"}:
                raise ProtocolError(
                    "SCHEMA_INVALID", f"invalid operation {index}", stage="replay"
                )
            if not isinstance(operation["value"], str):
                raise ProtocolError(
                    "SCHEMA_INVALID", f"operation {index} value must be a string", stage="replay"
                )
            if operation["op"] == "test":
                if value != operation["value"]:
                    raise ReplayPreconditionFailed(f"string test failed at operation {index}")
            elif operation["op"] == "replace":
                value = operation["value"]
            else:
                raise ProtocolError(
                    "SCHEMA_INVALID", f"unknown operation {index}", stage="replay"
                )
        return {"schema": "t3x/state/v1", "codec": dict(base["codec"]), "value": value}


class IndependentVerifier:
    def __init__(
        self,
        kernel: ProtocolKernel,
        resolver: Resolver,
        drivers: Iterable[Driver] = (),
    ) -> None:
        self.kernel = kernel
        self.resolver = resolver
        self.drivers = {_driver_key(driver.reference): driver for driver in drivers}

    def replay(
        self,
        base: Mapping[str, Any],
        effect: Mapping[str, Any],
        inputs: Mapping[str, Mapping[str, Any]],
    ) -> Mapping[str, Any]:
        definition = {
            "driver": dict(effect["driver"]),
            "operations": list(effect["operations"]),
            "inputs": list(effect["inputs"]),
        }
        if set(inputs) != {member["role"] for member in definition["inputs"]}:
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "replay input roles differ", stage="replay"
            )
        for declared in definition["inputs"]:
            if not _same_descriptor(
                self.kernel.descriptor(inputs[declared["role"]]), declared["object"]
            ):
                raise ProtocolError(
                    "INTEGRITY_CHAIN_INVALID", "replay input descriptor differs", stage="replay"
                )
        driver = self.drivers.get(_driver_key(definition["driver"]))
        if driver is None:
            raise ProtocolError(
                "UNSUPPORTED_SEMANTICS", "mutation driver is unavailable", stage="replay"
            )
        return self.kernel.validate_object(driver.execute(base, definition, inputs))

    def verify_effect(self, effect: Mapping[str, Any]) -> Mapping[str, Any]:
        parsed = self.kernel.validate_object(effect)
        if parsed["schema"] != "t3x/effect/v1":
            raise ProtocolError("SCHEMA_INVALID", "Effect required", stage="schema")
        base = self.resolver.resolve(parsed["base"])
        inputs = {
            member["role"]: self.resolver.resolve(member["object"])
            for member in parsed["inputs"]
        }
        try:
            result = self.replay(base, parsed, inputs)
        except ReplayPreconditionFailed as error:
            raise ProtocolError(
                "EFFECT_CLAIM_FALSE", str(error), stage="replay"
            ) from error
        descriptor = self.kernel.descriptor(result)
        if not _same_descriptor(descriptor, parsed["result"]):
            raise ProtocolError(
                "EFFECT_CLAIM_FALSE", "replay Result differs from claim", stage="replay"
            )
        return descriptor

    def verify_commit(self, commit: Mapping[str, Any]) -> None:
        parsed = self.kernel.validate_object(commit)
        if parsed["schema"] != "t3x/commit/v2":
            raise ProtocolError("SCHEMA_INVALID", "CommitV2 required", stage="schema")

        decision = self.resolver.resolve(parsed["decision"])
        if (
            decision.get("schema") != "t3x/statement/v1"
            or decision.get("predicateType") != "t3x.decision/v1"
        ):
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "Commit decision is not a Decision", stage="integrity"
            )
        if decision["predicate"]["outcome"] == "rejected":
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "rejected Decision cannot commit", stage="integrity"
            )

        proposal = self.resolver.resolve(decision["subjects"][0])
        if (
            proposal.get("schema") != "t3x/statement/v1"
            or proposal.get("predicateType") != "t3x.proposal/v1"
        ):
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "Decision subject is not a Proposal", stage="integrity"
            )
        effect = self.resolver.resolve(proposal["subjects"][0])
        if effect.get("schema") != "t3x/effect/v1":
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "Proposal subject is not an Effect", stage="integrity"
            )
        if not _same_descriptor(parsed["result"], effect["result"]):
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID", "Commit and Effect Results differ", stage="integrity"
            )

        base = self.resolver.resolve(effect["base"])
        self.resolver.resolve(parsed["result"])
        for considered in decision["predicate"]["considered"]:
            statement = self.resolver.resolve(considered)
            for subject in statement["subjects"]:
                self.resolver.resolve(subject)

        parents = [self.resolver.resolve(descriptor) for descriptor in parsed["parents"]]
        if not parents and not (isinstance(base["value"], dict) and not base["value"]):
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID",
                "parentless commit requires empty genesis",
                stage="integrity",
            )
        if parents and not _same_descriptor(parents[0]["result"], effect["base"]):
            raise ProtocolError(
                "INTEGRITY_CHAIN_INVALID",
                "first parent Result differs from Base",
                stage="integrity",
            )
        declared = [member["object"] for member in effect["inputs"]]
        for parent in parents[1:]:
            if not any(_same_descriptor(candidate, parent["result"]) for candidate in declared):
                raise ProtocolError(
                    "INTEGRITY_CHAIN_INVALID",
                    "merge parent Result is not a declared input",
                    stage="integrity",
                )
