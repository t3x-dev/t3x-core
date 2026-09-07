import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../examples/official-projects');

// This pack deliberately supports mapping roots only. Never silently lose a native
// scalar root (for example a GitHub Actions name) through semantic conversion.
export function toContent(value) {
  const mapping = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);
  function node(key, item) {
    if (!mapping(item)) throw new Error(`Root ${key} must be a mapping`);
    const entries = Object.entries(item);
    return {
      key,
      slots: Object.fromEntries(entries.filter(([, v]) => !mapping(v))),
      children: entries.filter(([, v]) => mapping(v)).map(([k, v]) => node(k, v)),
    };
  }
  if (!mapping(value)) throw new Error('Project content must be a mapping');
  return { trees: Object.entries(value).map(([key, item]) => node(key, item)), relations: [] };
}

export async function loadProjects() {
  const projects = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(root, entry.name);
    const project = JSON.parse(await readFile(resolve(dir, 'project.json'), 'utf8'));
    if (project.slug !== entry.name || project.license !== 'Apache-2.0')
      throw new Error(`Invalid official pack entry: ${entry.name}`);
    toContent(project.initial);
    toContent(project.demonstration.value);
    const avatar = await readFile(resolve(dir, 'avatar.png'));
    projects.push({
      ...project,
      presentation: {
        description: project.description,
        readme: await readFile(resolve(dir, 'README.md'), 'utf8'),
        tags: project.tags,
        avatarPath: 'avatar.png',
        resources: [
          {
            path: 'avatar.png',
            mediaType: 'image/png',
            alt: `${project.title} · T3X`,
            base64: avatar.toString('base64'),
          },
        ],
      },
    });
  }
  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main() {
  const { values } = parseArgs({
    options: {
      api: { type: 'string', default: 'http://127.0.0.1:8100/api/v1' },
      apply: { type: 'boolean', default: false },
      receipt: { type: 'string' },
    },
  });
  const api = new URL(values.api);
  if (
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    (api.protocol !== 'https:' &&
      !(api.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)))
  )
    throw new Error('Use an HTTPS API or localhost, without embedded credentials');
  const base = api.href.replace(/\/$/, '');
  const projects = await loadProjects();
  if (!values.apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'preview',
          namespace: 't3x-dev',
          projects: projects.map((p) => ({
            slug: p.slug,
            title: p.title,
            commits: 2,
            companionSchema: p.companionSchema,
          })),
        },
        null,
        2
      )
    );
    return;
  }
  if (!values.receipt)
    throw new Error('--receipt is required; keep this local record outside the repository');
  let receipt = { api: base, namespace: 't3x-dev', projects: {} };
  try {
    receipt = JSON.parse(await readFile(values.receipt, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (receipt.api !== base || receipt.namespace !== 't3x-dev')
    throw new Error('Receipt belongs to another destination');
  const save = () =>
    writeFile(values.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  async function request(path, body) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.T3X_TOKEN ? { Authorization: `Bearer ${process.env.T3X_TOKEN}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(`${response.status}: ${result.error?.code ?? 'REQUEST_FAILED'}`);
    return result.data;
  }
  const namespace = await request('/namespaces/t3x-dev');
  if (namespace.slug !== 't3x-dev' || namespace.kind !== 'organization')
    throw new Error('Expected the reserved T3X organization');
  // Check every page: a retry after an ambiguous create must not duplicate an
  // existing project. Never claim or update an arbitrary matching project.
  const names = new Set();
  for (let offset = 0; ; offset += 100) {
    const page = await request(`/projects?namespace=t3x-dev&limit=100&offset=${offset}`);
    const items = Array.isArray(page) ? page : (page.projects ?? page.items);
    if (!Array.isArray(items)) throw new Error('Unexpected project listing');
    for (const project of items) names.add(project.name);
    if (items.length < 100) break;
  }
  for (const project of projects) {
    if (!receipt.projects[project.slug] && names.has(project.title))
      throw new Error(
        `Project already exists: ${project.slug}; inspect its ownership before adopting it`
      );
  }
  await save();
  for (const project of projects) {
    let saved = receipt.projects[project.slug];
    if (!saved) {
      const created = await request('/projects', {
        name: project.title,
        namespace: 't3x-dev',
        metadata: {
          description: project.description,
          officialPack: project.slug,
          license: project.license,
        },
      });
      saved = receipt.projects[project.slug] = { projectId: created.project_id, commits: [] };
      await save();
    }
    const existing = await request(`/projects/${encodeURIComponent(saved.projectId)}`);
    if (existing.name !== project.title || existing.metadata?.officialPack !== project.slug)
      throw new Error(`Project receipt mismatch: ${project.slug}`);
    const revisions = [
      { message: 'Initialize T3X example (sample content)', value: project.initial },
      project.demonstration,
    ];
    for (let index = 0; index < revisions.length; index++) {
      if (!saved.commits[index]) {
        const previous = saved.commits[index - 1]?.digest ?? null;
        const target = await request(
          `/projects/${saved.projectId}/refs/main/presentation-authoring`
        );
        if (target.head !== previous)
          throw new Error(`Project changed outside this receipt: ${project.slug}`);
        const created = await request('/commits', {
          project_id: saved.projectId,
          branch: 'main',
          expected_head: previous,
          content: toContent(revisions[index].value),
          message: revisions[index].message,
        });
        saved.commits[index] = { digest: created.commit.digest, presentation: false };
        await save();
      }
      const commit = saved.commits[index];
      if (!commit.presentation) {
        await request(
          `/projects/${saved.projectId}/commits/${encodeURIComponent(commit.digest)}/presentation`,
          project.presentation
        );
        commit.presentation = true;
        await save();
      }
    }
    console.log(`${project.slug}: ${saved.projectId} ${saved.commits.at(-1).digest}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
