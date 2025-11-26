"""
Ring 1/2/3 提取器演示

展示如何使用新实现的 Ring 提取器从对话中提取语义信息。
"""

from pathlib import Path
import sys

# 添加 core 到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.extractors import RingExtractor, ExtractorConfig


def main():
    """演示 Ring 提取器的使用"""

    # 1. 初始化提取器
    config = ExtractorConfig(
        plugin="spacy",
        model="en_core_web_sm",
        language="en",
    )

    extractor = RingExtractor(config)

    # 2. 示例对话
    test_conversations = [
        {
            "turn_id": "turn-1",
            "content": "I want to visit Japan in November. I prefer quiet places and I don't like crowded cities."
        },
        {
            "turn_id": "turn-2",
            "content": "My budget is around $5000. I need to book hotels and flights."
        },
        {
            "turn_id": "turn-3",
            "content": "I plan to stay for two weeks. I hope to see Mount Fuji."
        }
    ]

    # 3. 提取 Ring 1/2/3
    print("=" * 80)
    print("Ring 1/2/3 提取器演示")
    print("=" * 80)
    print()

    for conversation in test_conversations:
        turn_id = conversation["turn_id"]
        content = conversation["content"]

        print(f"\n📝 Turn: {turn_id}")
        print(f"   Content: {content}")
        print()

        # 提取
        result = extractor.extract(turn_id, content)

        # 显示 Ring 1
        print("   🔵 Ring 1: 关键词主轴")
        print(f"      Topic: {result.ring1.topic}")
        print(f"      Time Anchor: {result.ring1.time_anchor}")
        print(f"      Keywords ({len(result.ring1.keywords)}):")
        for kw in result.ring1.keywords[:10]:  # 只显示前 10 个
            polarity_symbol = {-1: "❌", 0: "⚪", 1: "✅"}[kw.polarity]
            print(f"         {polarity_symbol} {kw.text} → {kw.lemma} (pos={kw.pos}, polarity={kw.polarity})")

        # 显示 Ring 1 偏好关键词
        if result.ring1.preference_keywords:
            print(f"\n      Preference Keywords ({len(result.ring1.preference_keywords)}):")
            for kw in result.ring1.preference_keywords:
                polarity_symbol = {-1: "👎 Avoid", 1: "👍 Prefer"}[kw.polarity]
                print(f"         {polarity_symbol}: {kw.lemma}")

        # 显示 Ring 2
        print(f"\n   🟢 Ring 2: 轻关系 / Facet")
        print(f"      Facets ({len(result.ring2.facets)}):")
        for facet in result.ring2.facets:
            print(f"         [{facet.facet_type}] {facet.key} = {facet.value} (conf={facet.confidence:.2f})")

        # 显示 Ring 3
        print(f"\n   🟣 Ring 3: 分句结构")
        print(f"      Segments ({len(result.ring3.segments)}):")
        for seg in result.ring3.segments:
            print(f"         {seg.segment_id}: \"{seg.text}\"")

        print("\n   " + "-" * 76)

    # 4. 显示提取器元数据
    print("\n\n📊 提取器元数据")
    metadata = extractor.get_metadata()
    print(f"   Plugin: {metadata.plugin}")
    print(f"   Model: {metadata.model}")
    print(f"   Version: {metadata.version}")
    print(f"   Language: {metadata.language}")

    print("\n" + "=" * 80)
    print("✅ 演示完成！")
    print("=" * 80)


if __name__ == "__main__":
    main()
