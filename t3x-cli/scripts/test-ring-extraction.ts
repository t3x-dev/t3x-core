#!/usr/bin/env npx ts-node
/**
 * Test Ring Extraction
 *
 * Tests the complete Ring 1/2/3 extraction using Google Cloud NLP.
 *
 * Usage:
 *   GOOGLE_CLOUD_NLP_KEY=your_key npx ts-node scripts/test-ring-extraction.ts
 */

import { createGoogleCloudNLPProvider } from "../src/core/providers/nlp";
import { createRingExtractor } from "../src/core/extractors";

async function main() {
  const apiKey = process.env.GOOGLE_CLOUD_NLP_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: GOOGLE_CLOUD_NLP_KEY or GOOGLE_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log("🧪 Testing Ring Extraction with Google Cloud NLP\n");

  // Create providers
  const nlpProvider = createGoogleCloudNLPProvider({ apiKey });
  const extractor = createRingExtractor(nlpProvider);

  // Test cases based on ARCHITECTURE.zh.md examples
  const testCases = [
    {
      name: "Basic preference with polarity",
      text: "I want to travel to Japan in November. I don't like crowded places.",
    },
    {
      name: "Question with unknown slot",
      text: "What are the best hotels in Tokyo? When should I book?",
    },
    {
      name: "Negative preference",
      text: "I hate spicy food and I avoid seafood.",
    },
    {
      name: "Planning intent",
      text: "I plan to visit Kyoto and Osaka next week.",
    },
    {
      name: "Complex sentence",
      text: "I want to find a quiet hotel near the station. I prefer traditional Japanese style but I don't need breakfast.",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`   Input: "${testCase.text}"`);
    console.log("=".repeat(60));

    try {
      const result = await extractor.extract(`test-${Date.now()}`, testCase.text);

      // Ring 1
      console.log("\n📊 Ring 1 (主题主轴):");
      console.log(`   Topic: ${result.ring1.topic ?? "(none)"}`);
      console.log(`   Time Anchor: ${result.ring1.timeAnchor ?? "(none)"}`);
      console.log(`   Keywords (${result.ring1.keywords.length}):`);
      for (const kw of result.ring1.keywords.slice(0, 10)) {
        const polarityIcon = kw.polarity === 1 ? "👍" : kw.polarity === -1 ? "👎" : "  ";
        const entity = kw.entityType ? ` [${kw.entityType}]` : "";
        console.log(`      ${polarityIcon} ${kw.lemma} (${kw.pos})${entity}`);
      }
      if (result.ring1.keywords.length > 10) {
        console.log(`      ... and ${result.ring1.keywords.length - 10} more`);
      }

      if (result.ring1.preferenceKeywords.length > 0) {
        console.log(`   Preference Keywords (${result.ring1.preferenceKeywords.length}):`);
        for (const kw of result.ring1.preferenceKeywords) {
          const polarityIcon = kw.polarity === 1 ? "👍 prefer" : "👎 avoid";
          console.log(`      ${polarityIcon}: ${kw.lemma}`);
        }
      }

      // Ring 2
      console.log("\n📊 Ring 2 (轻关系/Facet):");
      if (result.ring2.facets.length === 0) {
        console.log("   (no facets extracted)");
      } else {
        for (const facet of result.ring2.facets) {
          console.log(`   [${facet.facetType}] ${facet.key}: ${facet.value} (conf: ${facet.confidence.toFixed(2)})`);
        }
      }

      // Ring 3
      console.log("\n📊 Ring 3 (分句结构):");
      for (const seg of result.ring3.segments) {
        console.log(`   ${seg.segmentId}: "${seg.text.substring(0, 50)}${seg.text.length > 50 ? "..." : ""}"`);
      }

      console.log("\n✅ Test passed");
    } catch (error) {
      console.error(`\n❌ Test failed: ${(error as Error).message}`);
    }
  }

  console.log("\n\n🎉 All tests completed!");
}

main().catch(console.error);
