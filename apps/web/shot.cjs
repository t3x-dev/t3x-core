const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Skip BOTH onboarding layers
  await context.addInitScript(() => {
    localStorage.setItem('t3x-onboarding-seen', 'true');
    localStorage.setItem('t3x-tour-completed', 'true');
  });

  const pages = [
    ['01-home', '/'],
    ['02-canvas', '/project/proj_1da080be'],
    ['03-insights', '/insights'],
    ['04-deploy', '/deploy'],
    ['05-deploy-compare', '/deploy/compare'],
    ['06-agent-demo-chat', '/agent-demo/chat'],
  ];

  for (const [name, path] of pages) {
    const page = await context.newPage();
    try {
      await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
    } catch (_e) {
      console.log('TIMEOUT: ' + name + ' (screenshotting anyway)');
    }
    await page.screenshot({ path: '/tmp/t3x-assessment/' + name + '.png' });
    console.log('OK: ' + name);
    await page.close();
  }

  // Fetch conversation IDs via API
  const apiPage = await context.newPage();
  const convData = await (
    await apiPage.request.get('http://localhost:8000/api/v1/conversations?project_id=proj_1da080be')
  ).json();
  const convIds = (convData.data.conversations || []).map((c) => c.conversation_id);
  console.log('Conversations: ' + JSON.stringify(convIds));

  const commitData = await (
    await apiPage.request.get('http://localhost:8000/api/v1/commits-v4?project_id=proj_1da080be')
  ).json();
  const commits = commitData.data.commits || [];
  console.log(
    'Commits: ' +
      JSON.stringify(
        commits.map((c) => ({
          h: c.hash.slice(0, 25),
          b: c.branch,
          s: (c.content.sentences || []).length,
        }))
      )
  );
  await apiPage.close();

  // Conversation detail
  if (convIds.length > 0) {
    const p = await context.newPage();
    try {
      await p.goto('http://localhost:3000/project/proj_1da080be/conversation/' + convIds[0], {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      await p.waitForTimeout(2000);
    } catch (_e) {}
    await p.screenshot({ path: '/tmp/t3x-assessment/07-conversation.png' });
    console.log('OK: conversation');
    await p.close();
  }

  await browser.close();
  console.log('DONE');
})();
