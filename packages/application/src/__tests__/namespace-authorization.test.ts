import { describe, expect, it } from 'vitest';
import {
  evaluateProjectAction,
  LEGACY_OWNERSHIP_FIXTURES,
  NAMESPACE_ACTIONS,
  NAMESPACE_AUTHORIZATION_FIXTURES,
  NAMESPACE_ROLE_ACTIONS,
  namespaceRoleAllows,
  PROJECT_GRANT_ACTIONS,
  projectGrantRoleAllows,
  resolveLegacyProjectOwnership,
} from '../identity';

function authorizationFixture(id: string) {
  const fixture = NAMESPACE_AUTHORIZATION_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Missing authorization fixture: ${id}`);
  return structuredClone(fixture.facts);
}

describe('canonical namespace action matrix', () => {
  it('keeps ownership, administration, editing and viewing capabilities distinct', () => {
    expect(NAMESPACE_ROLE_ACTIONS.owner).toEqual(NAMESPACE_ACTIONS);
    expect(namespaceRoleAllows('owner', 'namespace:ownership:transfer')).toBe(true);
    expect(namespaceRoleAllows('admin', 'namespace:ownership:transfer')).toBe(false);
    expect(namespaceRoleAllows('admin', 'namespace:members:manage')).toBe(true);
    expect(namespaceRoleAllows('editor', 'project:create')).toBe(true);
    expect(namespaceRoleAllows('editor', 'project:delete')).toBe(false);
    expect(namespaceRoleAllows('viewer', 'project:read')).toBe(true);
    expect(namespaceRoleAllows('viewer', 'project:edit')).toBe(false);
  });

  it('keeps project guests project-scoped and unable to transfer ownership', () => {
    expect(PROJECT_GRANT_ACTIONS.admin).not.toContain('project:transfer');
    expect(projectGrantRoleAllows('admin', 'project:guests:manage')).toBe(true);
    expect(projectGrantRoleAllows('editor', 'project:edit')).toBe(true);
    expect(projectGrantRoleAllows('editor', 'project:delete')).toBe(false);
    expect(projectGrantRoleAllows('viewer', 'project:read')).toBe(true);
    expect(projectGrantRoleAllows('viewer', 'project:edit')).toBe(false);
  });
});

describe('stored project authority', () => {
  it('allows current namespace membership and project grants only within their boundary', () => {
    const owner = authorizationFixture('organization_owner');
    expect(evaluateProjectAction(owner, 'project:transfer')).toEqual({
      allowed: true,
      source: 'namespace_membership',
    });

    const guest = authorizationFixture('project_guest_editor');
    expect(evaluateProjectAction(guest, 'project:edit')).toEqual({
      allowed: true,
      source: 'project_grant',
    });
    expect(evaluateProjectAction(guest, 'project:delete')).toEqual({
      allowed: false,
      reason: 'role_denied',
    });

    guest.project.project_id = 'project_other';
    expect(evaluateProjectAction(guest, 'project:read')).toEqual({
      allowed: false,
      reason: 'project_mismatch',
    });
  });

  it('fails closed for revoked memberships and cross-namespace facts', () => {
    const revoked = authorizationFixture('revoked_member');
    expect(evaluateProjectAction(revoked, 'project:read')).toEqual({
      allowed: false,
      reason: 'inactive_membership',
    });

    const crossNamespace = authorizationFixture('organization_owner');
    if (!crossNamespace.namespace_membership) throw new Error('fixture requires membership');
    crossNamespace.namespace_membership.namespace_id = 'namespace_other';
    expect(evaluateProjectAction(crossNamespace, 'project:read')).toEqual({
      allowed: false,
      reason: 'namespace_mismatch',
    });
  });

  it('intersects machine authority with its explicit project and action scope', () => {
    const service = authorizationFixture('scoped_service_principal');
    expect(evaluateProjectAction(service, 'project:read')).toEqual({
      allowed: true,
      source: 'namespace_membership',
    });
    expect(evaluateProjectAction(service, 'project:edit')).toEqual({
      allowed: false,
      reason: 'credential_scope_denied',
    });

    if (!service.credential_scope) throw new Error('fixture requires credential scope');
    service.credential_scope.project_id = 'project_other';
    expect(evaluateProjectAction(service, 'project:read')).toEqual({
      allowed: false,
      reason: 'credential_project_mismatch',
    });

    const unscoped = authorizationFixture('scoped_service_principal');
    delete unscoped.credential_scope;
    expect(evaluateProjectAction(unscoped, 'project:read')).toEqual({
      allowed: false,
      reason: 'machine_principal_requires_project_scope',
    });
  });
});

describe('legacy project ownership inventory', () => {
  it.each(LEGACY_OWNERSHIP_FIXTURES)('$id resolves to the declared mapping', (fixture) => {
    expect(resolveLegacyProjectOwnership(fixture.row, fixture.inventory)).toEqual(fixture.expected);
  });

  it('never treats an owner-null shared namespace or its slug as authority', () => {
    const ownerless = LEGACY_OWNERSHIP_FIXTURES.find(
      (fixture) => fixture.id === 'ownerless_default_quarantined'
    );
    expect(ownerless).toBeDefined();
    expect(resolveLegacyProjectOwnership(ownerless!.row, ownerless!.inventory)).toEqual({
      status: 'quarantined',
      project_id: 'project_ownerless',
      reason: 'owner_missing',
    });
  });

  it('quarantines unknown namespaces and organizations without current membership', () => {
    const base = LEGACY_OWNERSHIP_FIXTURES[0];
    expect(base).toBeDefined();
    if (!base) return;

    expect(
      resolveLegacyProjectOwnership(
        {
          project_id: 'project_unknown',
          owner_id: 'user_owner',
          namespace_id: 'namespace_unknown',
        },
        base.inventory
      )
    ).toEqual({
      status: 'quarantined',
      project_id: 'project_unknown',
      reason: 'unknown_namespace',
    });

    expect(
      resolveLegacyProjectOwnership(
        {
          project_id: 'project_team_other',
          owner_id: 'user_other',
          namespace_id: 'namespace_team',
        },
        base.inventory
      )
    ).toEqual({
      status: 'quarantined',
      project_id: 'project_team_other',
      reason: 'organization_membership_missing',
    });
  });
});
