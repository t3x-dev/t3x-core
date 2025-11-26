from pathlib import Path


def test_packaged_schema_matches_canonical():
    repo_root = Path(__file__).resolve().parents[3]
    canonical = repo_root / "schema" / "v1.0.json"
    packaged = repo_root / "sdk" / "python" / "contextflow" / "schema" / "v1.0.json"

    assert canonical.exists(), "Canonical schema is missing"
    assert packaged.exists(), "Packaged schema copy is missing"
    assert canonical.read_text(encoding="utf-8") == packaged.read_text(
        encoding="utf-8"
    ), "Packaged schema must stay in sync with canonical schema"
