"""
Bridge 加载器演示

展示如何加载和使用 Bridge YAML 模板。
"""

from pathlib import Path
import sys

# 添加 core 到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.bridges import BridgeLoader


def main():
    """演示 Bridge 加载器的使用"""

    # 1. 初始化加载器（使用默认目录）
    loader = BridgeLoader()

    print("=" * 80)
    print("Bridge 加载器演示")
    print("=" * 80)
    print()

    # 2. 列出所有可用的 Bridge
    bridges = loader.list_bridges()
    print(f"📚 可用的 Bridge ({len(bridges)}):")
    for bridge_id in bridges:
        print(f"   - {bridge_id}")
    print()

    # 3. 加载并展示每个 Bridge
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
            print(f"\n   Prompt (前 200 字符):")
            prompt_preview = template.prompt[:200].replace('\n', '\n      ')
            print(f"      {prompt_preview}...")

    # 4. 演示阈值优先级
    print("\n\n" + "=" * 80)
    print("阈值优先级演示")
    print("=" * 80)

    bridge_id = "plan"

    # 只使用 Bridge 默认阈值
    template, threshold = loader.get_with_threshold(bridge_id)
    print(f"\n1. 只使用 Bridge 默认阈值:")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   来源: Bridge YAML ({template.threshold})")

    # 使用项目配置覆盖
    template, threshold = loader.get_with_threshold(
        bridge_id,
        config_threshold=0.70,
    )
    print(f"\n2. 使用项目配置覆盖:")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   来源: config.json (0.70) > Bridge YAML ({template.threshold})")

    # 使用 CLI 参数覆盖（最高优先级）
    template, threshold = loader.get_with_threshold(
        bridge_id,
        cli_threshold=0.80,
        config_threshold=0.70,
    )
    print(f"\n3. 使用 CLI 参数覆盖（最高优先级）:")
    print(f"   Bridge: {bridge_id}")
    print(f"   Effective Threshold: {threshold}")
    print(f"   来源: CLI (0.80) > config.json (0.70) > Bridge YAML ({template.threshold})")

    print("\n" + "=" * 80)
    print("✅ 演示完成！")
    print("=" * 80)


if __name__ == "__main__":
    main()
