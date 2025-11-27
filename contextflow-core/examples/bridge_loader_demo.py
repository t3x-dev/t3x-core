"""
Bridge Loader Demo

Demonstrates how to load and use Bridge YAML templates.
"""

from pathlib import Path
import sys

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.bridges import BridgeLoader


def main():
    """Demonstrate Bridge loader usage"""

    # 1. Initialize loader (using default directory)
    loader = BridgeLoader()

    print("=" * 80)
    print("Bridge Loader Demo")
    print("=" * 80)
    print()

    # 2. List all available Bridges
    bridges = loader.list_bridges()
    print(f"📚 Available Bridges ({len(bridges)}):")
    for bridge_id in bridges:
        print(f"   - {bridge_id}")
    print()

    # 3. Load and display each Bridge
    for bridge_id in bridges:
        template = loader.get(bridge_id)
        if template:
            print("\n" + "─" * 80)
            print(f"\n🔖 Bridge: {template.bridge}")
            print(f"   Label: {template.label}")
            print(f"   Version: {template.version}")
            print(f"   Locale: {template.locale}")
            print(f"   Threshold: {template.threshold}")
            print(f"\n   Description:")
            if template.description:
                for line in template.description.strip().split('\n'):
                    print(f"      {line}")
            print(f"\n   Prompt (first 200 characters):")
            prompt_preview = template.prompt[:200].replace('\n', '\n      ')
            print(f"      {prompt_preview}...")

    # 4. Demonstrate threshold priority
    print("\n\n" + "=" * 80)
    print("Threshold Priority Demo")
    print("=" * 80)

    bridge_id = "plan"

    # Use only Bridge default threshold
    template, threshold = loader.get_with_threshold(bridge_id)
    print(f"\n1. Using only Bridge default threshold:")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   Source: Bridge YAML ({template.threshold})")

    # Override with project configuration
    template, threshold = loader.get_with_threshold(
        bridge_id,
        config_threshold=0.70,
    )
    print(f"\n2. Override with project configuration:")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   Source: config.json (0.70) > Bridge YAML ({template.threshold})")

    # Override with CLI parameter (highest priority)
    template, threshold = loader.get_with_threshold(
        bridge_id,
        cli_threshold=0.80,
        config_threshold=0.70,
    )
    print(f"\n3. Override with CLI parameter (highest priority):")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   Source: CLI (0.80) > config.json (0.70) > Bridge YAML ({template.threshold})")

    print("\n" + "=" * 80)
    print("✅ Demo Complete!")
    print("=" * 80)


if __name__ == "__main__":
    main()
