/**
 * Comprehensive head-to-head comparison: sentenceRules vs Intl.Segmenter
 *
 * Categories:
 *   1. Basic splitting (punctuation, empty, whitespace)
 *   2. Tech names & file extensions
 *   3. URLs & domains
 *   4. Version numbers
 *   5. Abbreviations (titles, Latin, geographic)
 *   6. Decimals & numbers
 *   7. List markers (numbered, bullet, letter)
 *   8. Closing characters (quotes, parens)
 *   9. Ellipsis
 *  10. CJK content
 *  11. Newline handling
 *  12. Real-world AI conversation paragraphs
 *  13. Code-mixed prose
 *  14. Edge cases
 */

import { describe, it } from 'vitest';
import { splitSentencesRuleBased } from '../../providers/nlp/sentenceRules';
import { splitSentences } from '../../providers/nlp/sentenceSplitter';

interface TestCase {
  id: string;
  category: string;
  input: string;
  /** Expected sentences (gold standard). null = don't check exact match */
  expected: string[] | null;
  /** If expected is null, first sentence should contain this */
  firstContains?: string;
  /** If expected is null, expected sentence count */
  count?: number;
}

const CASES: TestCase[] = [
  // =====================================================================
  // 1. Basic splitting
  // =====================================================================
  {
    id: 'basic-01',
    category: 'Basic',
    input: 'Hello world. Goodbye world!',
    expected: ['Hello world.', 'Goodbye world!'],
  },
  {
    id: 'basic-02',
    category: 'Basic',
    input: 'First. Second. Third.',
    expected: ['First.', 'Second.', 'Third.'],
  },
  {
    id: 'basic-03',
    category: 'Basic',
    input: 'Why? Because. Wow!',
    expected: ['Why?', 'Because.', 'Wow!'],
  },
  {
    id: 'basic-04',
    category: 'Basic',
    input: '',
    expected: [],
  },
  {
    id: 'basic-05',
    category: 'Basic',
    input: 'Hello',
    expected: ['Hello'],
  },
  {
    id: 'basic-06',
    category: 'Basic',
    input: '   ',
    expected: [],
  },

  // =====================================================================
  // 2. Tech names & file extensions
  // =====================================================================
  {
    id: 'tech-01',
    category: 'Tech names',
    input: 'We use Node.js for the backend. It is fast.',
    expected: null,
    firstContains: 'Node.js',
    count: 2,
  },
  {
    id: 'tech-02',
    category: 'Tech names',
    input: 'Edit the file index.ts to fix it. Then rebuild.',
    expected: null,
    firstContains: 'index.ts',
    count: 2,
  },
  {
    id: 'tech-03',
    category: 'Tech names',
    input: 'Check config.yaml for settings. Update if needed.',
    expected: null,
    firstContains: 'config.yaml',
    count: 2,
  },
  {
    id: 'tech-04',
    category: 'Tech names',
    input: 'Open App.tsx and add the component. Save it.',
    expected: null,
    firstContains: 'App.tsx',
    count: 2,
  },
  {
    id: 'tech-05',
    category: 'Tech names',
    input: 'Edit webpack.config.js for bundling. Then run build.',
    expected: null,
    firstContains: 'webpack.config.js',
    count: 2,
  },
  {
    id: 'tech-06',
    category: 'Tech names',
    input: 'The package.json has 20 dependencies. We should trim them.',
    expected: null,
    firstContains: 'package.json',
    count: 2,
  },
  {
    id: 'tech-07',
    category: 'Tech names',
    input: 'We use Next.js with App Router. It handles SSR well.',
    expected: null,
    firstContains: 'Next.js',
    count: 2,
  },
  {
    id: 'tech-08',
    category: 'Tech names',
    input: 'Configure tsconfig.json for strict mode. TypeScript catches more bugs.',
    expected: null,
    firstContains: 'tsconfig.json',
    count: 2,
  },
  {
    id: 'tech-09',
    category: 'Tech names',
    input: 'We use Node.js. React is popular.',
    expected: ['We use Node.js.', 'React is popular.'],
  },
  {
    id: 'tech-10',
    category: 'Tech names',
    input: 'Check D3.js docs. Then integrate.',
    expected: null,
    firstContains: 'D3.js',
    count: 2,
  },
  {
    id: 'tech-11',
    category: 'Tech names',
    input: 'Update .env.local with new keys. Restart the server.',
    expected: null,
    firstContains: '.env.local',
    count: 2,
  },

  // =====================================================================
  // 3. URLs & domains
  // =====================================================================
  {
    id: 'url-01',
    category: 'URLs',
    input: 'Visit docs.example.com for details. It has guides.',
    expected: null,
    firstContains: 'docs.example.com',
    count: 2,
  },
  {
    id: 'url-02',
    category: 'URLs',
    input: 'The API is at api.t3x.dev for production. Use localhost for dev.',
    expected: null,
    firstContains: 'api.t3x.dev',
    count: 2,
  },
  {
    id: 'url-03',
    category: 'URLs',
    input: 'Check github.com for the repo. Clone it locally.',
    expected: null,
    firstContains: 'github.com',
    count: 2,
  },

  // =====================================================================
  // 4. Version numbers
  // =====================================================================
  {
    id: 'ver-01',
    category: 'Versions',
    input: 'Use Node.js 18.x for this project. It is stable.',
    expected: null,
    firstContains: '18.x',
  },
  {
    id: 'ver-02',
    category: 'Versions',
    input: 'Upgrade to v2.0 now. It has fixes.',
    expected: null,
    firstContains: 'v2.0',
    count: 2,
  },
  {
    id: 'ver-03',
    category: 'Versions',
    input: 'React 18.2.0 introduced concurrent features. Performance improved.',
    expected: null,
    firstContains: '18.2.0',
    count: 2,
  },

  // =====================================================================
  // 5. Abbreviations
  // =====================================================================
  {
    id: 'abbr-01',
    category: 'Abbreviations',
    input: 'Dr. Smith arrived. Welcome.',
    expected: ['Dr. Smith arrived.', 'Welcome.'],
  },
  {
    id: 'abbr-02',
    category: 'Abbreviations',
    input: 'Mrs. Jones left early. She had a meeting.',
    expected: null,
    firstContains: 'Mrs. Jones',
    count: 2,
  },
  {
    id: 'abbr-03',
    category: 'Abbreviations',
    input: 'Prof. Lee teaches math. He is great.',
    expected: null,
    firstContains: 'Prof. Lee',
    count: 2,
  },
  {
    id: 'abbr-04',
    category: 'Abbreviations',
    input: 'Red vs. blue is the debate. Choose wisely.',
    expected: null,
    firstContains: 'vs.',
  },
  {
    id: 'abbr-05',
    category: 'Abbreviations',
    input: 'Use tools like Git, Docker, etc. and deploy. Done.',
    expected: null,
    firstContains: 'etc.',
  },
  {
    id: 'abbr-06',
    category: 'Abbreviations',
    input: 'The U.S. economy grew. Exports rose.',
    expected: null,
    firstContains: 'U.S.',
  },
  {
    id: 'abbr-07',
    category: 'Abbreviations',
    input: 'Use e.g. this approach. Next.',
    expected: null,
    firstContains: 'e.g.',
  },
  {
    id: 'abbr-08',
    category: 'Abbreviations',
    input: 'That is i.e. this one. Next.',
    expected: null,
    firstContains: 'i.e.',
  },
  {
    id: 'abbr-09',
    category: 'Abbreviations',
    input: 'Meet at 3 p.m. today. Bring notes.',
    expected: null,
    firstContains: 'p.m.',
  },
  {
    id: 'abbr-10',
    category: 'Abbreviations',
    input: 'St. Louis is in Missouri. It is large.',
    expected: null,
    firstContains: 'St. Louis',
  },

  // =====================================================================
  // 6. Decimals & numbers
  // =====================================================================
  {
    id: 'num-01',
    category: 'Numbers',
    input: 'Price is 3.14. Next item.',
    expected: null,
    firstContains: '3.14',
    count: 2,
  },
  {
    id: 'num-02',
    category: 'Numbers',
    input: 'GDP growth of 2.5% was expected. Markets reacted.',
    expected: null,
    firstContains: '2.5%',
    count: 2,
  },
  {
    id: 'num-03',
    category: 'Numbers',
    input: 'Temperature was 98.6 degrees. Patient recovered.',
    expected: null,
    firstContains: '98.6',
    count: 2,
  },

  // =====================================================================
  // 7. List markers
  // =====================================================================
  {
    id: 'list-01',
    category: 'Lists',
    input: '1. First item. 2. Second item.',
    expected: null,
    firstContains: '1.',
    count: 2,
  },
  {
    id: 'list-02',
    category: 'Lists',
    input: '1. First item\n2. Second item\n3. Third item',
    expected: ['1. First item', '2. Second item', '3. Third item'],
  },
  {
    id: 'list-03',
    category: 'Lists',
    input: '- Item one\n- Item two\n- Item three',
    expected: ['- Item one', '- Item two', '- Item three'],
  },

  // =====================================================================
  // 8. Closing characters
  // =====================================================================
  {
    id: 'close-01',
    category: 'Closing chars',
    input: '"Hello." Next.',
    expected: ['"Hello."', 'Next.'],
  },
  {
    id: 'close-02',
    category: 'Closing chars',
    input: '(Done.) Next.',
    expected: ['(Done.)', 'Next.'],
  },
  {
    id: 'close-03',
    category: 'Closing chars',
    input: 'She said "I agree." Then she left.',
    expected: null,
    firstContains: 'I agree.',
    count: 2,
  },

  // =====================================================================
  // 9. Ellipsis
  // =====================================================================
  {
    id: 'ellipsis-01',
    category: 'Ellipsis',
    input: 'Wait for it... Done!',
    expected: ['Wait for it...', 'Done!'],
  },
  {
    id: 'ellipsis-02',
    category: 'Ellipsis',
    input: 'Hmm\u2026 Interesting.',
    expected: ['Hmm\u2026', 'Interesting.'],
  },

  // =====================================================================
  // 10. CJK content
  // =====================================================================
  {
    id: 'cjk-01',
    category: 'CJK',
    input: '\u4F60\u597D\u3002\u518D\u89C1\uFF01',
    expected: ['\u4F60\u597D\u3002', '\u518D\u89C1\uFF01'],
  },
  {
    id: 'cjk-02',
    category: 'CJK',
    input: '\u4E3A\u4EC0\u4E48\uFF1F\u56E0\u4E3A\u3002',
    expected: ['\u4E3A\u4EC0\u4E48\uFF1F', '\u56E0\u4E3A\u3002'],
  },
  {
    id: 'cjk-03',
    category: 'CJK',
    input: 'Hello\u3002\u4F60\u597D!',
    expected: null,
    count: 2,
    firstContains: 'Hello',
  },

  // =====================================================================
  // 11. Newline handling
  // =====================================================================
  {
    id: 'newline-01',
    category: 'Newlines',
    input: 'First paragraph.\n\nSecond paragraph.',
    expected: ['First paragraph.', 'Second paragraph.'],
  },
  {
    id: 'newline-02',
    category: 'Newlines',
    input: 'End here.\nNew start.',
    expected: ['End here.', 'New start.'],
  },
  {
    id: 'newline-03',
    category: 'Newlines',
    input: 'Line one.\r\nLine two.',
    expected: ['Line one.', 'Line two.'],
  },

  // =====================================================================
  // 12. Real-world AI conversation paragraphs
  // =====================================================================
  {
    id: 'real-01',
    category: 'Real-world',
    input:
      'Dr. Smith met Mrs. Jones at 3.14 pm. They discussed the U.S. economy. Key points were shared.',
    expected: null,
    firstContains: 'Dr. Smith',
    count: 3,
  },
  {
    id: 'real-02',
    category: 'Real-world',
    input:
      'I recommend using Next.js for the frontend. It supports SSR out of the box. You can configure it in next.config.js and deploy to Vercel.',
    expected: null,
    firstContains: 'Next.js',
    count: 3,
  },
  {
    id: 'real-03',
    category: 'Real-world',
    input:
      'The user prefers dark mode. They mentioned using VS Code with the One Dark Pro theme. We should store this preference in config.yaml for future reference.',
    expected: null,
    firstContains: 'dark mode',
    count: 3,
  },
  {
    id: 'real-04',
    category: 'Real-world',
    input:
      'To set up the project, follow these steps: 1. Clone the repo. 2. Run pnpm install. 3. Copy .env.example to .env. 4. Start the dev server.',
    expected: null,
    firstContains: 'follow these steps',
  },
  {
    id: 'real-05',
    category: 'Real-world',
    input:
      'The API server runs on port 8000. Check the endpoint at localhost:8000/v1/health. If it returns 200, the server is ready.',
    expected: null,
    firstContains: 'port 8000',
    count: 3,
  },
  {
    id: 'real-06',
    category: 'Real-world',
    input:
      "Based on the user's preferences, they want: a concise writing style, technical accuracy (e.g. citing specific APIs), and examples in TypeScript. We should avoid overly formal language.",
    expected: null,
    firstContains: 'preferences',
  },
  {
    id: 'real-07',
    category: 'Real-world',
    input:
      'The error occurs in src/utils/parser.ts at line 42. It throws a TypeError when the input is null. We need to add a null check before accessing the property.',
    expected: null,
    firstContains: 'parser.ts',
    count: 3,
  },
  {
    id: 'real-08',
    category: 'Real-world',
    input:
      'Migration from Express.js to Hono was completed. Performance improved by 3.2x on average. Memory usage dropped from 512MB to 180MB.',
    expected: null,
    firstContains: 'Express.js',
    count: 3,
  },
  {
    id: 'real-09',
    category: 'Real-world',
    input:
      'The user asked about React vs. Vue for their project. I recommended React because of its larger ecosystem. They agreed and want to use Next.js specifically.',
    expected: null,
    firstContains: 'vs.',
    count: 3,
  },
  {
    id: 'real-10',
    category: 'Real-world',
    input:
      'Key findings from the conversation: 1. The user needs a REST API. 2. Authentication should use JWT tokens. 3. Rate limiting at 100 req/min. 4. Data should be stored in PostgreSQL.',
    expected: null,
    firstContains: 'Key findings',
  },
  {
    id: 'real-11',
    category: 'Real-world',
    input:
      'The deployment process involves building the Docker image (see Dockerfile.prod), pushing to ECR, and updating the ECS task definition. The CI/CD pipeline in .github/workflows/deploy.yml handles this automatically.',
    expected: null,
    firstContains: 'Dockerfile.prod',
  },
  {
    id: 'real-12',
    category: 'Real-world',
    input:
      'According to the documentation at docs.t3x.dev, the commit schema follows a DAG structure. Each commit has parent hashes (similar to Git). The hash is computed from JCS-canonicalized JSON.',
    expected: null,
    firstContains: 'docs.t3x.dev',
    count: 3,
  },

  // =====================================================================
  // 13. Code-mixed prose
  // =====================================================================
  {
    id: 'code-01',
    category: 'Code-mixed',
    input: 'Use console.log() for debugging. It prints to stdout. Remove it before committing.',
    expected: null,
    firstContains: 'console.log()',
    count: 3,
  },
  {
    id: 'code-02',
    category: 'Code-mixed',
    input:
      'The function Math.max() returns the largest value. Use it with spread operator for arrays.',
    expected: null,
    firstContains: 'Math.max()',
    count: 2,
  },
  {
    id: 'code-03',
    category: 'Code-mixed',
    input:
      'Import from @t3x-dev/core using ES modules. The main export is createEngine. See README.md for examples.',
    expected: null,
    firstContains: '@t3x-dev/core',
    count: 3,
  },

  // =====================================================================
  // 14. Edge cases
  // =====================================================================
  {
    id: 'edge-01',
    category: 'Edge',
    input: 'A. Hello world.',
    expected: null,
    count: 2,
  },
  {
    id: 'edge-02',
    category: 'Edge',
    input: 'Mr. and Mrs. Smith went to Dr. Lee. They arrived at 5 p.m. sharp.',
    expected: null,
    firstContains: 'Mr. and Mrs. Smith',
  },
  {
    id: 'edge-03',
    category: 'Edge',
    input: 'U.S.A. is a country. It is large.',
    expected: null,
    firstContains: 'U.S.A.',
  },
  {
    id: 'edge-04',
    category: 'Edge',
    input: 'She said "Wait!" He replied "OK."',
    expected: null,
    count: 2,
  },
  {
    id: 'edge-05',
    category: 'Edge',
    input: 'End. ',
    expected: ['End.'],
  },
  {
    id: 'edge-06',
    category: 'Edge',
    input: 'First sentence ends here.Second starts without space.',
    expected: null,
    firstContains: 'First sentence',
  },
  {
    id: 'edge-07',
    category: 'Edge',
    input: '...and then what? Nothing.',
    expected: null,
    count: 2,
  },
  {
    id: 'edge-08',
    category: 'Edge',
    input: 'Is this a test? Yes! Absolutely. No doubt?',
    expected: ['Is this a test?', 'Yes!', 'Absolutely.', 'No doubt?'],
  },
];

function evaluate(
  splitter: (text: string) => Array<{ text: string }>,
  tc: TestCase
): { pass: boolean; texts: string[]; reason?: string } {
  const results = splitter(tc.input);
  const texts = results.map((s) => s.text);

  // Exact match check
  if (tc.expected !== null) {
    const match = JSON.stringify(texts) === JSON.stringify(tc.expected);
    return {
      pass: match,
      texts,
      reason: match ? undefined : `expected ${JSON.stringify(tc.expected)}`,
    };
  }

  // Count check
  if (tc.count !== undefined && texts.length !== tc.count) {
    return {
      pass: false,
      texts,
      reason: `expected ${tc.count} sentences, got ${texts.length}`,
    };
  }

  // Contains check
  if (tc.firstContains && !texts.some((t) => t.includes(tc.firstContains!))) {
    return {
      pass: false,
      texts,
      reason: `no sentence contains "${tc.firstContains}"`,
    };
  }

  return { pass: true, texts };
}

describe('Comprehensive Splitter Comparison (sentenceRules vs Intl.Segmenter)', () => {
  const allResults: Array<{
    id: string;
    category: string;
    input: string;
    rulePass: boolean;
    ruleTexts: string[];
    ruleReason?: string;
    icuPass: boolean;
    icuTexts: string[];
    icuReason?: string;
    diverged: boolean;
  }> = [];

  for (const tc of CASES) {
    it(`[${tc.id}] ${tc.input.slice(0, 70)}${tc.input.length > 70 ? '...' : ''}`, () => {
      const rule = evaluate(splitSentencesRuleBased, tc);
      const icu = evaluate(splitSentences, tc);
      const diverged = JSON.stringify(rule.texts) !== JSON.stringify(icu.texts);

      allResults.push({
        id: tc.id,
        category: tc.category,
        input: tc.input,
        rulePass: rule.pass,
        ruleTexts: rule.texts,
        ruleReason: rule.reason,
        icuPass: icu.pass,
        icuTexts: icu.texts,
        icuReason: icu.reason,
        diverged,
      });

      // We don't assert here — the summary test prints the report
    });
  }

  it('=== FINAL REPORT ===', () => {
    const total = allResults.length;
    const rulePassCount = allResults.filter((r) => r.rulePass).length;
    const icuPassCount = allResults.filter((r) => r.icuPass).length;
    const divergences = allResults.filter((r) => r.diverged);
    const icuWins = allResults.filter((r) => r.icuPass && !r.rulePass);
    const ruleWins = allResults.filter((r) => r.rulePass && !r.icuPass);
    const bothFail = allResults.filter((r) => !r.rulePass && !r.icuPass);

    // Group by category
    const categories = [...new Set(CASES.map((c) => c.category))];
    const catStats = categories.map((cat) => {
      const cases = allResults.filter((r) => r.category === cat);
      return {
        category: cat,
        total: cases.length,
        rulePass: cases.filter((r) => r.rulePass).length,
        icuPass: cases.filter((r) => r.icuPass).length,
      };
    });

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           COMPREHENSIVE SPLITTER COMPARISON REPORT                  ║');
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log(
      `║  Total test cases:     ${String(total).padStart(3)}                                        ║`
    );
    console.log(
      `║  Rules pass:           ${String(rulePassCount).padStart(3)}/${total}  (${((rulePassCount / total) * 100).toFixed(1).padStart(5)}%)                          ║`
    );
    console.log(
      `║  Intl.Segmenter pass:  ${String(icuPassCount).padStart(3)}/${total}  (${((icuPassCount / total) * 100).toFixed(1).padStart(5)}%)                          ║`
    );
    console.log(
      `║  Divergences:          ${String(divergences.length).padStart(3)}                                        ║`
    );
    console.log(
      `║  ICU wins (only ICU):  ${String(icuWins.length).padStart(3)}                                        ║`
    );
    console.log(
      `║  Rules wins (only R):  ${String(ruleWins.length).padStart(3)}                                        ║`
    );
    console.log(
      `║  Both fail:            ${String(bothFail.length).padStart(3)}                                        ║`
    );
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log('║  BY CATEGORY                                                        ║');
    console.log('╠══════════════════════════════════════════════════════════════════════╣');

    for (const cs of catStats) {
      const rPct = ((cs.rulePass / cs.total) * 100).toFixed(0).padStart(3);
      const iPct = ((cs.icuPass / cs.total) * 100).toFixed(0).padStart(3);
      const cat = cs.category.padEnd(15);
      console.log(
        `║  ${cat} ${String(cs.total).padStart(2)} cases │ Rules: ${cs.rulePass}/${cs.total} (${rPct}%) │ ICU: ${cs.icuPass}/${cs.total} (${iPct}%) ║`
      );
    }

    console.log('╠══════════════════════════════════════════════════════════════════════╣');

    if (divergences.length > 0) {
      console.log('║  DIVERGENCE DETAILS                                                  ║');
      console.log('╠══════════════════════════════════════════════════════════════════════╣');
      for (const d of divergences) {
        const rIcon = d.rulePass ? '✅' : '❌';
        const iIcon = d.icuPass ? '✅' : '❌';
        console.log(`║  [${d.id}] Rules ${rIcon}  ICU ${iIcon}`);
        console.log(`║    Input: "${d.input.slice(0, 60)}${d.input.length > 60 ? '...' : ''}"`);
        console.log(`║    Rules: ${JSON.stringify(d.ruleTexts).slice(0, 64)}`);
        console.log(`║    ICU:   ${JSON.stringify(d.icuTexts).slice(0, 64)}`);
        if (d.ruleReason) console.log(`║    Rule reason: ${d.ruleReason}`);
        if (d.icuReason) console.log(`║    ICU reason:  ${d.icuReason}`);
        console.log('║');
      }
    }

    if (bothFail.length > 0) {
      console.log('╠══════════════════════════════════════════════════════════════════════╣');
      console.log('║  BOTH FAIL                                                           ║');
      console.log('╠══════════════════════════════════════════════════════════════════════╣');
      for (const d of bothFail) {
        console.log(`║  [${d.id}] Input: "${d.input.slice(0, 55)}..."`);
        console.log(`║    Rules: ${JSON.stringify(d.ruleTexts).slice(0, 64)}`);
        console.log(`║    ICU:   ${JSON.stringify(d.icuTexts).slice(0, 64)}`);
        if (d.ruleReason) console.log(`║    Rule reason: ${d.ruleReason}`);
        if (d.icuReason) console.log(`║    ICU reason:  ${d.icuReason}`);
        console.log('║');
      }
    }

    console.log('╚══════════════════════════════════════════════════════════════════════╝');
  });
});
