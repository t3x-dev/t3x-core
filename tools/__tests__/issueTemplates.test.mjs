import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

const root = new URL('../../', import.meta.url);
const templatesDir = new URL('.github/ISSUE_TEMPLATE/', root);
const allowedTemplateLabels = new Set(['bug', 'documentation', 'enhancement', 'question']);

function readYaml(path) {
  return load(readFileSync(new URL(path, root), 'utf8'));
}

function readIssueTemplates() {
  return readdirSync(templatesDir)
    .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
    .map((fileName) => ({
      fileName,
      data: readYaml(`.github/ISSUE_TEMPLATE/${fileName}`),
    }));
}

test('issue template contact links do not point to unavailable destinations', () => {
  const config = readYaml('.github/ISSUE_TEMPLATE/config.yml');
  const urls = (config.contact_links ?? []).map((link) => link.url);

  assert.ok(
    !urls.some((url) => String(url).includes('github.com/t3x/t3x/discussions')),
    'contact links must not point to disabled or stale Discussions'
  );
  assert.ok(
    !urls.some((url) => String(url).includes('t3x.dev/docs')),
    'contact links must not point to the unavailable docs route'
  );
});

test('issue templates only apply repository labels that exist today', () => {
  for (const { fileName, data } of readIssueTemplates()) {
    for (const label of data.labels ?? []) {
      assert.ok(allowedTemplateLabels.has(label), `${fileName} uses unsupported label "${label}"`);
    }
  }
});

test('question template does not send users to Discussions', () => {
  const questionTemplate = readYaml('.github/ISSUE_TEMPLATE/question.yml');
  const bodyText = JSON.stringify(questionTemplate.body ?? []);

  assert.equal(questionTemplate.description, 'Ask a question about T3X');
  assert.equal(questionTemplate.labels?.[0], 'question');
  assert.ok(!bodyText.includes('Discussions'));
});
