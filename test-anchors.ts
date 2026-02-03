import { StubNLPProvider } from './packages/core/src/__tests__/setup';
import { RingExtractor } from './packages/core/src/extractors/ringExtractor';

const extractor = new RingExtractor(new StubNLPProvider());

const testCases = [
  'I want to travel to Bangkok for 2 weeks in November. Budget is around $3000.',
  'The contract requires 30 days notice and a $5000 deposit. Interest rate is 15%.',
  'We discussed visiting Tokyo, Kyoto, and Osaka. The trip should be 10 days.',
  'Please book a flight to New York on January 15, 2025. Maximum budget $1500.',
];

async function test() {
  for (const text of testCases) {
    console.log('\n' + '='.repeat(80));
    console.log('INPUT:', text);
    console.log('='.repeat(80));

    const result = await extractor.extract('test', text);

    console.log('\n📌 Anchor Candidates:');
    if (result.ring1.anchorCandidates && result.ring1.anchorCandidates.length > 0) {
      for (const a of result.ring1.anchorCandidates) {
        const typeStr = a.type.padEnd(8);
        console.log(
          `  [${typeStr}] "${a.text}" @ ${a.startChar}-${a.endChar} (${a.source}, conf: ${a.confidence})`
        );
      }
    } else {
      console.log('  (none)');
    }

    console.log('\n🔑 Keywords:');
    if (result.ring1.keywords.length > 0) {
      for (const k of result.ring1.keywords) {
        console.log(`  "${k.text}" (${k.pos}, polarity: ${k.polarity}, conf: ${k.confidence})`);
      }
    } else {
      console.log('  (none)');
    }
  }
}

test().catch(console.error);
