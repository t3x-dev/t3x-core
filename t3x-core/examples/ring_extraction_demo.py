"""
Ring 1/2/3 Extractor Demo

Demonstrates how to use the newly implemented Ring extractor to extract semantic information from conversations.
"""

from pathlib import Path
import sys

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.extractors import RingExtractor, ExtractorConfig


def main():
    """Demonstrate Ring extractor usage"""

    # 1. Initialize extractor
    config = ExtractorConfig(
        plugin="spacy",
        model="en_core_web_sm",
        language="en",
    )

    extractor = RingExtractor(config)

    # 2. Example conversations
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

    # 3. Extract Ring 1/2/3
    print("=" * 80)
    print("Ring 1/2/3 Extractor Demo")
    print("=" * 80)
    print()

    for conversation in test_conversations:
        turn_id = conversation["turn_id"]
        content = conversation["content"]

        print(f"\n📝 Turn: {turn_id}")
        print(f"   Content: {content}")
        print()

        # Extract
        result = extractor.extract(turn_id, content)

        # Display Ring 1
        print("   🔵 Ring 1: Keyword Backbone")
        print(f"      Topic: {result.ring1.topic}")
        print(f"      Time Anchor: {result.ring1.time_anchor}")
        print(f"      Keywords ({len(result.ring1.keywords)}):")
        for kw in result.ring1.keywords[:10]:  # Only show first 10
            polarity_symbol = {-1: "❌", 0: "⚪", 1: "✅"}[kw.polarity]
            print(f"         {polarity_symbol} {kw.text} → {kw.lemma} (pos={kw.pos}, polarity={kw.polarity})")

        # Display Ring 1 preference keywords
        if result.ring1.preference_keywords:
            print(f"\n      Preference Keywords ({len(result.ring1.preference_keywords)}):")
            for kw in result.ring1.preference_keywords:
                polarity_symbol = {-1: "👎 Avoid", 1: "👍 Prefer"}[kw.polarity]
                print(f"         {polarity_symbol}: {kw.lemma}")

        # Display Ring 2
        print(f"\n   🟢 Ring 2: Lightweight Relations / Facets")
        print(f"      Facets ({len(result.ring2.facets)}):")
        for facet in result.ring2.facets:
            print(f"         [{facet.facet_type}] {facet.key} = {facet.value} (conf={facet.confidence:.2f})")

        # Display Ring 3
        print(f"\n   🟣 Ring 3: Segmented Structure")
        print(f"      Segments ({len(result.ring3.segments)}):")
        for seg in result.ring3.segments:
            print(f"         {seg.segment_id}: \"{seg.text}\"")

        print("\n   " + "-" * 76)

    # 4. Display extractor metadata
    print("\n\n📊 Extractor Metadata")
    metadata = extractor.get_metadata()
    print(f"   Plugin: {metadata.plugin}")
    print(f"   Model: {metadata.model}")
    print(f"   Version: {metadata.version}")
    print(f"   Language: {metadata.language}")

    print("\n" + "=" * 80)
    print("✅ Demo Complete!")
    print("=" * 80)


if __name__ == "__main__":
    main()
