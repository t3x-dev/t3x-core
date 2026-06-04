// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import {
  demoOps,
  demoTree,
  INTRO_DEMO_ROOT_KEY,
} from '@/hooks/onboarding/useIntroDemoReplayActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

const OLD_DEMO_ROOT_KEY = 'support_escalation_review';

describe('useIntroDemoReplayActions demo content', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('keeps extracted demo YAML content while removing the old bundled root name', () => {
    const tree = demoTree();
    const yaml = serializeOpsToYaml(demoOps());

    expect(tree.trees[0]?.key).toBe(INTRO_DEMO_ROOT_KEY);
    expect(tree.trees[0]?.children.length).toBeGreaterThan(0);
    expect(tree.relations[0]?.from).toContain(INTRO_DEMO_ROOT_KEY);
    expect(yaml).toContain(INTRO_DEMO_ROOT_KEY);
    expect(yaml).toContain('refund_policy');
    expect(yaml).not.toContain(OLD_DEMO_ROOT_KEY);
  });
});
