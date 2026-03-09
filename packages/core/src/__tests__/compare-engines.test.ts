/**
 * Ring vs Frame Engine — Real-world Quality Comparison
 *
 * Feeds realistic conversation data through both engines and compares
 * extraction quality side-by-side.
 *
 * Run:
 *   source ../../.env && cd packages/core && npx vitest run src/__tests__/compare-engines.test.ts
 */

import { describe, it } from 'vitest';
import {
  createRingExtractor,
  createGoogleCloudNLPProvider,
  createClaudeProvider,
  FrameExtractor,
} from '../index';
import type { SemanticContent, SlotValue } from '../semantic/types';

// ── Realistic Conversation ──

const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [
  {
    role: 'user',
    content:
      'I want to plan a trip to Japan in April. Budget is around $5000 for two people. ' +
      'We prefer window seats on flights and want to avoid group tours.',
  },
  {
    role: 'assistant',
    content:
      'April is a wonderful time to visit Japan — cherry blossom season! For $5000 for two, ' +
      "I'd suggest 10 days focusing on Tokyo and Kyoto. You can book individual seats rather " +
      "than tour packages. Here's a rough breakdown: flights $1200/person, hotels $150/night, " +
      'food and transport $100/day. Would you like a detailed itinerary?',
  },
  {
    role: 'user',
    content:
      "Yes please. We're vegetarian so we need restaurants that accommodate that. " +
      "We definitely don't want to stay in hostels. Prefer traditional ryokan in Kyoto " +
      "and a modern hotel in Tokyo. Also, we're interested in temples but not theme parks.",
  },
  {
    role: 'assistant',
    content:
      'Great preferences! Here\'s a refined plan:\n\n' +
      '**Tokyo (5 nights):** Park Hotel Tokyo in Ginza (~$180/night), close to Tsukiji outer market. ' +
      'Vegetarian-friendly spots: T\'s TanTan (vegan ramen at Tokyo Station), Ain Soph Ripple in Shinjuku.\n\n' +
      '**Kyoto (4 nights):** Ryokan Yoshida-sanso (~$200/night), a traditional inn with garden views. ' +
      'Must-visit temples: Kinkaku-ji, Fushimi Inari, Kiyomizu-dera.\n\n' +
      'Total estimate: flights $2400 + Tokyo hotels $900 + Kyoto ryokan $800 + food/transport $900 = $5000.',
  },
  {
    role: 'user',
    content:
      "This looks great but can we add Osaka for 2 days? I've heard the street food scene " +
      "is amazing. We'd need to cut one night from Tokyo then. Also, " +
      "my partner is allergic to shellfish — that's critical for restaurant choices.",
  },
];

// ── Helpers ──

const DRAFT_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'about', 'between',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
  'yes', 'like', 'want', 'get', 'got', 'let', 'make', 'go', 'know',
  'take', 'see', 'come', 'think', 'look', 'give', 'use', 'find',
  'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call',
]);

function isValueableKeyword(kw: string): boolean {
  if (kw.length < 3) return false;
  if (DRAFT_STOP_WORDS.has(kw.toLowerCase())) return false;
  if (/^\d+$/.test(kw)) return false;
  if (!/^[a-z]/i.test(kw)) return false;
  return true;
}

const POLARITY_KEYS = /^(polarity|sentiment|preference|mood|attitude|valence)$/i;
const NEGATIVE_VALUES = /^(negative|avoid|exclude|dislike|against|no|must.not|don.t|never)$/i;
const NEGATIVE_FRAME_TYPES = /\b(dislike|avoid|exclude|negative|reject|ban)\b/i;
const NEGATIVE_SLOT_KEYS =
  /(?:^|_)(exclude|avoid|not_interested|dislike|reject|ban|allerg(?:en|y|ic)?|dont_want|must_not|negative)(?:_|$)/i;

function extractPreferencesFromFrames(snapshot: SemanticContent): {
  mustHave: string[];
  mustNotHave: string[];
} {
  const mustHave: string[] = [];
  const mustNotHave: string[] = [];
  const seenLower = new Set<string>();

  for (const frame of snapshot.frames) {
    const slots = frame.slots;
    let isNegative = NEGATIVE_FRAME_TYPES.test(frame.type);

    for (const [key, val] of Object.entries(slots)) {
      if (!POLARITY_KEYS.test(key)) continue;
      if (typeof val !== 'string') continue;
      if (NEGATIVE_VALUES.test(val)) isNegative = true;
    }

    for (const [key, val] of Object.entries(slots)) {
      if (POLARITY_KEYS.test(key)) continue;
      if (typeof val !== 'string' || !isValueableKeyword(val)) continue;
      const kwLower = val.toLowerCase();
      if (seenLower.has(kwLower)) continue;
      seenLower.add(kwLower);
      if (isNegative || NEGATIVE_SLOT_KEYS.test(key)) {
        mustNotHave.push(val);
      } else {
        mustHave.push(val);
      }
    }
  }

  return { mustHave, mustNotHave };
}

function slotDisplay(slots: Record<string, SlotValue>): string {
  return Object.entries(slots)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    .join(', ');
}

// ── Test ──

describe('Ring vs Frame Engine Comparison', () => {
  it('compares extraction quality on a travel planning conversation', async () => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GOOGLE_CLOUD_NLP_KEY = process.env.GOOGLE_CLOUD_NLP_KEY;

    if (!ANTHROPIC_API_KEY || !GOOGLE_CLOUD_NLP_KEY) {
      console.log('⏭ Skipping: ANTHROPIC_API_KEY and GOOGLE_CLOUD_NLP_KEY required');
      return;
    }

    console.log('\n🔬 Ring vs Frame Engine — Quality Comparison');
    console.log(`   Conversation: ${conversation.length} turns (travel planning)`);
    console.log(`   Date: ${new Date().toISOString()}\n`);

    // ═══════════════════════════════════════════════════════════
    // RING ENGINE
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70));
    console.log('  RING ENGINE (Old — NLP-based, deterministic)');
    console.log('═'.repeat(70));

    const nlpProvider = createGoogleCloudNLPProvider(GOOGLE_CLOUD_NLP_KEY);
    const ringExtractor = createRingExtractor(nlpProvider);

    const allRingKeywords: string[] = [];
    const ringNegatives: string[] = [];
    const seenRing = new Set<string>();

    for (let i = 0; i < conversation.length; i++) {
      const turn = conversation[i];
      console.log(`\n  [Turn ${i + 1}] ${turn.role}: "${turn.content.substring(0, 60)}..."`);

      try {
        const ringOutput = await ringExtractor.extract(`turn_${i}`, turn.content, 'en');
        const r1 = ringOutput.ring1;
        const r3 = ringOutput.ring3;

        const keywords = (r1.keywords ?? []).map((k) =>
          typeof k === 'string' ? k : (k as { text?: string; lemma?: string }).text ?? (k as { lemma?: string }).lemma ?? ''
        );
        const entities = (r1.entities ?? []).map(
          (e) => `${e.text} (${e.type})`
        );
        const prefKws = r1.preference_keywords ?? [];
        const positive = prefKws.filter((pk) => pk.polarity !== 'negative' && pk.polarity !== -1).map((pk) => pk.keyword);
        const negative = prefKws.filter((pk) => pk.polarity === 'negative' || pk.polarity === -1).map((pk) => pk.keyword);

        console.log(`    Keywords: [${keywords.join(', ')}]`);
        console.log(`    Entities: [${entities.join(', ')}]`);
        console.log(`    Pref+: [${positive.join(', ')}]  Pref-: [${negative.join(', ')}]`);
        console.log(`    Segments: ${(r3.segments ?? []).length} sentences`);

        for (const kw of keywords) {
          const kwL = kw.toLowerCase();
          if (!seenRing.has(kwL) && isValueableKeyword(kw)) {
            seenRing.add(kwL);
            allRingKeywords.push(kw);
          }
        }
        for (const neg of negative) {
          ringNegatives.push(neg);
        }
      } catch (err) {
        console.log(`    ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log('\n  ── Ring Aggregated Preferences ──');
    console.log(`  must_have (${allRingKeywords.length}): [${allRingKeywords.slice(0, 20).join(', ')}]`);
    console.log(`  must_not_have (${ringNegatives.length}): [${ringNegatives.join(', ')}]`);

    // ═══════════════════════════════════════════════════════════
    // FRAME ENGINE
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('  FRAME ENGINE (New — LLM-based, semantic)');
    console.log('═'.repeat(70));

    const claudeProvider = createClaudeProvider({
      apiKey: ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-5-20250929',
    });
    const frameExtractor = new FrameExtractor(claudeProvider);

    let currentSnapshot: SemanticContent | undefined;

    for (let i = 0; i < conversation.length; i++) {
      const turnsUpToNow = conversation.slice(0, i + 1).map((t) => ({
        role: t.role,
        content: t.content,
      }));

      console.log(`\n  [Turn ${i + 1}] ${conversation[i].role}: "${conversation[i].content.substring(0, 60)}..."`);

      try {
        const result = await frameExtractor.extract({
          turns: turnsUpToNow,
          snapshot: currentSnapshot,
        });

        if (result.ok) {
          currentSnapshot = result.snapshot;
          const changes = result.delta.changes ?? [];
          console.log(`    Delta: ${changes.length} changes`);
          for (const ch of changes) {
            if (ch.op === 'add' && ch.frame) {
              console.log(`      + [${ch.frame.type}] ${slotDisplay(ch.frame.slots)}`);
            } else if (ch.op === 'update') {
              console.log(`      ~ update ${ch.frame_id}: ${JSON.stringify(ch.updates)}`);
            } else if (ch.op === 'remove') {
              console.log(`      - remove ${ch.frame_id}`);
            }
          }
        } else {
          console.log(`    ❌ ${result.error}`);
        }
      } catch (err) {
        console.log(`    ❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!currentSnapshot) {
      console.log('❌ Frame extraction produced no snapshot');
      return;
    }

    console.log('\n  ── Frame Final Snapshot ──');
    console.log(`  Frames: ${currentSnapshot.frames.length}, Relations: ${currentSnapshot.relations.length}`);
    for (const frame of currentSnapshot.frames) {
      console.log(`    [${frame.id}] ${frame.type}: ${slotDisplay(frame.slots)}`);
    }
    for (const rel of currentSnapshot.relations) {
      console.log(`    ${rel.from} --${rel.type}--> ${rel.to}`);
    }

    console.log('\n  ── Frame Aggregated Preferences (fixed extractPreferencesFromFrames) ──');
    const framePrefs = extractPreferencesFromFrames(currentSnapshot);
    console.log(`  must_have (${framePrefs.mustHave.length}): [${framePrefs.mustHave.slice(0, 20).join(', ')}]`);
    console.log(`  must_not_have (${framePrefs.mustNotHave.length}): [${framePrefs.mustNotHave.join(', ')}]`);

    // ═══════════════════════════════════════════════════════════
    // COMPARISON
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('  SIDE-BY-SIDE COMPARISON');
    console.log('═'.repeat(70));

    const keyConcepts = ['Japan', 'April', 'vegetarian', 'ryokan', 'Tokyo', 'Kyoto', 'Osaka', 'shellfish', 'temples', 'budget'];
    const negConcepts = ['group tours', 'hostels', 'theme parks', 'shellfish'];

    console.log('\n  ✅ Positive Concept Coverage:');
    let ringScore = 0;
    let frameScore = 0;
    for (const concept of keyConcepts) {
      const cL = concept.toLowerCase();
      const inRing = allRingKeywords.some((k) => k.toLowerCase().includes(cL));
      const inFrame = framePrefs.mustHave.some((k) => k.toLowerCase().includes(cL));
      if (inRing) ringScore++;
      if (inFrame) frameScore++;
      console.log(`    "${concept}":  Ring=${inRing ? '✅' : '❌'}  Frame=${inFrame ? '✅' : '❌'}`);
    }

    console.log('\n  🚫 Negative Concept Coverage:');
    let ringNegScore = 0;
    let frameNegScore = 0;
    for (const concept of negConcepts) {
      const cL = concept.toLowerCase();
      const inRing = ringNegatives.some((k) => k.toLowerCase().includes(cL));
      const inFrame = framePrefs.mustNotHave.some((k) => k.toLowerCase().includes(cL));
      if (inRing) ringNegScore++;
      if (inFrame) frameNegScore++;
      console.log(`    "${concept}":  Ring=${inRing ? '✅' : '❌'}  Frame=${inFrame ? '✅' : '❌'}`);
    }

    console.log('\n  📊 Summary:');
    console.log(`    Ring:  ${ringScore}/${keyConcepts.length} positive, ${ringNegScore}/${negConcepts.length} negative`);
    console.log(`    Frame: ${frameScore}/${keyConcepts.length} positive, ${frameNegScore}/${negConcepts.length} negative`);
    console.log(`    Ring total keywords: ${allRingKeywords.length} (flat bag)`);
    console.log(`    Frame total frames: ${currentSnapshot.frames.length} with ${currentSnapshot.relations.length} relations (semantic graph)`);

    const frameMustSet = new Set(framePrefs.mustHave.map((k) => k.toLowerCase()));
    const ringMustSet = new Set(allRingKeywords.map((k) => k.toLowerCase()));
    const onlyInFrame = framePrefs.mustHave.filter((k) => !ringMustSet.has(k.toLowerCase()));
    const onlyInRing = allRingKeywords.filter((k) => !frameMustSet.has(k.toLowerCase()));
    console.log(`\n    Only in Frame: [${onlyInFrame.join(', ')}]`);
    console.log(`    Only in Ring:  [${onlyInRing.join(', ')}]`);

    console.log('\n  ✨ Conclusion:');
    const totalRing = ringScore + ringNegScore;
    const totalFrame = frameScore + frameNegScore;
    if (totalFrame > totalRing) {
      console.log(`    Frame engine captures MORE relevant concepts (${totalFrame} vs ${totalRing}).`);
    } else if (totalFrame === totalRing) {
      console.log(`    Both engines capture equal concepts (${totalFrame}).`);
    } else {
      console.log(`    Ring engine captures MORE concepts (${totalRing} vs ${totalFrame}).`);
    }
    console.log(`    Frame provides structured semantic graph; Ring provides flat keyword bags.`);
    console.log('');
  }, 120_000);
});
