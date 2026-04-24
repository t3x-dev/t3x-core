import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test.describe('Leaf Semantic Points', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let leafId: string;

  test.beforeAll(async ({ request }) => {
    const created = await createTestProject(request, `Leaf Semantic Points ${Date.now()}`);
    projectId = created.projectId;

    const commitResponse = await request.post(`${API_BASE}/commits`, {
      data: {
        project_id: projectId,
        content: {
          trees: [
            {
              key: 'trip',
              slots: {
                city: 'Kyoto',
                duration: '2 days',
                pace: ['quiet', 'walkable'],
              },
              children: [
                {
                  key: 'hotel',
                  slots: {
                    name: 'Sora House',
                    area: 'Gion',
                  },
                  children: [],
                },
              ],
            },
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
        branch: 'main',
        message: 'Leaf semantic points audit commit',
      },
    });
    const commitJson = await commitResponse.json();
    if (!commitJson.success) {
      throw new Error(`Failed to create commit: ${commitJson.error?.message}`);
    }
    const commitHash = commitJson.data.commit.hash;

    const leafResponse = await request.post(`${API_BASE}/leaves`, {
      data: {
        commit_hash: commitHash,
        project_id: projectId,
        type: 'tweet',
        title: 'Semantic Points E2E Leaf',
        constraints: [{ type: 'require', value: 'Kyoto', match_mode: 'exact' }],
        config: {
          semantic_point_overrides: [
            { point_id: 'trip/duration', state: 'excluded' },
            { point_id: 'trip/hotel/area', state: 'excluded' },
          ],
        },
      },
    });
    const leafJson = await leafResponse.json();
    if (!leafJson.success) {
      throw new Error(`Failed to create leaf: ${leafJson.error?.message}`);
    }
    leafId = leafJson.data.id;
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  test('shows semantic points, syncs left badges, and persists toggles', async ({ page }) => {
    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    await expect(page.getByText('Semantic Points')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('6 / 8 included')).toBeVisible();
    await expect(page.getByText('4/5 included')).toBeVisible();
    await expect(page.getByText('2/3 included')).toBeVisible();

    const durationCheckbox = page.getByLabel('trip.duration = 2 days');
    const hotelAreaCheckbox = page.getByLabel('trip.hotel.area = Gion');

    await expect(durationCheckbox).not.toBeChecked();
    await expect(hotelAreaCheckbox).not.toBeChecked();

    await durationCheckbox.check();
    await expect(page.getByText('7 / 8 included')).toBeVisible();
    await expect(page.getByText('5/5 included')).toBeVisible();

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText('7 / 8 included')).toBeVisible();
    await expect(page.getByLabel('trip.duration = 2 days')).toBeChecked();
    await expect(page.getByLabel('trip.hotel.area = Gion')).not.toBeChecked();
  });
});
