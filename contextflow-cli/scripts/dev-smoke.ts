#!/usr/bin/env npx ts-node
/**
 * Development Smoke Test
 *
 * Quick verification that Google AI Studio and Google Cloud NLP APIs work correctly.
 * Run with: npx ts-node scripts/dev-smoke.ts
 *
 * Prerequisites:
 * - Set GOOGLE_AI_STUDIO_KEY environment variable (for Gemini Embedding)
 * - Set GOOGLE_CLOUD_NLP_KEY environment variable (for Cloud NLP)
 * - npm install in contextflow-cli
 *
 * Note: These are different API keys from different Google services:
 * - AI Studio key: https://aistudio.google.com/app/apikey
 * - Cloud NLP key: https://console.cloud.google.com/apis/credentials (enable Cloud Natural Language API)
 */

import { createGoogleAIEmbeddingProvider } from "../src/core/providers/embedding/googleAI";
import { createGoogleCloudNLPProvider } from "../src/core/providers/nlp/googleCloud";
import { createRingExtractor } from "../src/core/extractors/ringExtractor";

// Test texts
const TEST_TEXT_EN = "I want to travel to Japan next November. My budget is around $5000 and I prefer quiet places.";
const TEST_TEXT_ZH = "我想在明年十一月去日本旅行。预算大约五千美元，我喜欢安静的地方。";

async function main() {
  const aiStudioKey = process.env.GOOGLE_AI_STUDIO_KEY;
  const cloudNlpKey = process.env.GOOGLE_CLOUD_NLP_KEY;

  console.log("🧪 t3x-core Provider Smoke Test");
  console.log("================================\n");

  // Check keys
  const missingKeys: string[] = [];
  if (!aiStudioKey) missingKeys.push("GOOGLE_AI_STUDIO_KEY");
  if (!cloudNlpKey) missingKeys.push("GOOGLE_CLOUD_NLP_KEY");

  if (missingKeys.length > 0) {
    console.error(`❌ Error: Missing environment variables: ${missingKeys.join(", ")}`);
    console.error("");
    console.error("Please set them before running this test:");
    if (!aiStudioKey) {
      console.error("  export GOOGLE_AI_STUDIO_KEY=your_ai_studio_key");
      console.error("  Get it at: https://aistudio.google.com/app/apikey");
    }
    if (!cloudNlpKey) {
      console.error("  export GOOGLE_CLOUD_NLP_KEY=your_cloud_nlp_key");
      console.error("  Get it at: https://console.cloud.google.com/apis/credentials");
      console.error("  (Enable 'Cloud Natural Language API' in your project)");
    }
    console.error("");
    process.exit(1);
  }

  // Test 1: Embedding Provider
  console.log("📊 Test 1: Google AI Studio Embedding");
  console.log("--------------------------------------");
  try {
    const embeddingProvider = createGoogleAIEmbeddingProvider({ apiKey: aiStudioKey! });
    console.log(`  Provider ID: ${embeddingProvider.id}`);
    console.log(`  Vector Dim: ${embeddingProvider.dim}`);

    const texts = ["Hello world", "你好世界"];
    console.log(`  Encoding ${texts.length} texts...`);

    const vectors = await embeddingProvider.encode(texts);
    console.log(`  ✅ Got ${vectors.length} vectors`);
    console.log(`  Vector 1 length: ${vectors[0].length}`);
    console.log(`  Vector 2 length: ${vectors[1].length}`);

    const similarity = embeddingProvider.similarity(vectors[0], vectors[1]);
    console.log(`  Similarity: ${similarity.toFixed(4)}`);
    console.log("");
  } catch (error) {
    console.error(`  ❌ Embedding test failed: ${(error as Error).message}`);
    console.log("");
  }

  // Test 2: NLP Provider
  console.log("🔤 Test 2: Google Cloud NLP");
  console.log("---------------------------");
  try {
    const nlpProvider = createGoogleCloudNLPProvider({ apiKey: cloudNlpKey! });
    console.log(`  Provider ID: ${nlpProvider.id}`);

    console.log(`  Analyzing English text...`);
    const analysisEn = await nlpProvider.analyze(TEST_TEXT_EN);
    console.log(`  ✅ Language detected: ${analysisEn.language}`);
    console.log(`  Sentiment: score=${analysisEn.sentiment.score.toFixed(2)}, magnitude=${analysisEn.sentiment.magnitude.toFixed(2)}`);
    console.log(`  Tokens: ${analysisEn.tokens.length}`);
    console.log(`  Entities: ${analysisEn.entities.length}`);
    console.log(`  Sentences: ${analysisEn.sentences.length}`);

    if (analysisEn.entities.length > 0) {
      console.log(`  Sample entities:`);
      analysisEn.entities.slice(0, 3).forEach((e) => {
        console.log(`    - "${e.text}" (${e.type}, salience=${e.salience.toFixed(2)})`);
      });
    }
    console.log("");

    console.log(`  Analyzing Chinese text...`);
    const analysisZh = await nlpProvider.analyze(TEST_TEXT_ZH);
    console.log(`  ✅ Language detected: ${analysisZh.language}`);
    console.log(`  Sentiment: score=${analysisZh.sentiment.score.toFixed(2)}, magnitude=${analysisZh.sentiment.magnitude.toFixed(2)}`);
    console.log(`  Tokens: ${analysisZh.tokens.length}`);
    console.log(`  Entities: ${analysisZh.entities.length}`);
    console.log(`  Sentences: ${analysisZh.sentences.length}`);
    console.log("");
  } catch (error) {
    console.error(`  ❌ NLP test failed: ${(error as Error).message}`);
    console.log("");
  }

  // Test 3: Ring Extractor
  console.log("🔗 Test 3: Ring Extractor");
  console.log("-------------------------");
  try {
    const nlpProvider = createGoogleCloudNLPProvider({ apiKey: cloudNlpKey! });
    const extractor = createRingExtractor(nlpProvider);

    console.log(`  Extracting Ring from English text...`);
    const ringEn = await extractor.extract("test-turn-en", TEST_TEXT_EN);
    console.log(`  ✅ Ring extracted`);
    console.log(`  Ring 1 - Keywords: ${ringEn.ring1.keywords.length}`);
    console.log(`  Ring 1 - Time Anchor: ${ringEn.ring1.timeAnchor ?? "(none)"}`);
    console.log(`  Ring 1 - Preference Keywords: ${ringEn.ring1.preferenceKeywords.length}`);
    console.log(`  Ring 2 - Facets: ${ringEn.ring2.facets.length}`);
    console.log(`  Ring 3 - Segments: ${ringEn.ring3.segments.length}`);

    if (ringEn.ring1.keywords.length > 0) {
      console.log(`  Sample keywords:`);
      ringEn.ring1.keywords.slice(0, 5).forEach((kw) => {
        console.log(`    - "${kw.text}" (${kw.pos}, polarity=${kw.polarity})`);
      });
    }

    if (ringEn.ring2.facets.length > 0) {
      console.log(`  Facets:`);
      ringEn.ring2.facets.forEach((f) => {
        console.log(`    - ${f.facetType}: ${f.key}=${JSON.stringify(f.value)}`);
      });
    }

    console.log("");
    console.log(`  Extracting Ring from Chinese text...`);
    const ringZh = await extractor.extract("test-turn-zh", TEST_TEXT_ZH);
    console.log(`  ✅ Ring extracted`);
    console.log(`  Ring 1 - Keywords: ${ringZh.ring1.keywords.length}`);
    console.log(`  Ring 3 - Segments: ${ringZh.ring3.segments.length}`);
    console.log("");
  } catch (error) {
    console.error(`  ❌ Ring Extractor test failed: ${(error as Error).message}`);
    console.log("");
  }

  console.log("================================");
  console.log("🎉 Smoke test completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
