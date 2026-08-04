#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from t3x_transition_verifier import ConformanceSuite, Divergence, ProtocolError


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the independent T3X Transition verifier")
    parser.add_argument("--repo-root", type=Path, required=True)
    arguments = parser.parse_args()

    try:
        counts = ConformanceSuite(arguments.repo_root).run()
    except Divergence as error:
        print(str(error), file=sys.stderr)
        return 1
    except ProtocolError as error:
        print(
            f"transition conformance error: stage={error.stage} code={error.code}",
            file=sys.stderr,
        )
        return 1

    summary = ", ".join(f"{name}={count}" for name, count in counts.items())
    print(f"transition conformance ok: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
