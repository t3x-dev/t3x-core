import { z } from 'zod';

export const COLLABORATION_CONTRACT_VERSION = 1 as const;
export const COLLABORATION_INVITATION_TOKEN_PREFIX = 't3xi_v1_' as const;

const ResourceIdSchema = z.string().trim().min(1).max(200);
const InstantSchema = z.iso.datetime({ offset: true });
const EmailSchema = z.email().max(320);

export const CollaborationPrincipalKindSchema = z.enum(['human', 'agent', 'service']);
export const NamespaceRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
export const NamespaceMemberRoleSchema = z.enum(['admin', 'editor', 'viewer']);
export const ProjectGrantRoleSchema = z.enum(['admin', 'editor', 'viewer']);
export const CollaborationStatusSchema = z.enum(['active', 'suspended', 'revoked']);
export const CollaborationInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export const NamespaceActionSchema = z.enum([
  'namespace:read',
  'namespace:update',
  'namespace:members:read',
  'namespace:members:manage',
  'namespace:invitations:manage',
  'namespace:ownership:transfer',
  'project:create',
  'project:read',
  'project:edit',
  'project:delete',
  'project:restore',
  'project:guests:manage',
  'project:transfer',
]);
export const ProjectActionSchema = z.enum([
  'project:read',
  'project:edit',
  'project:delete',
  'project:restore',
  'project:guests:manage',
  'project:transfer',
]);

export type CollaborationPrincipalKind = z.infer<typeof CollaborationPrincipalKindSchema>;
export type NamespaceRole = z.infer<typeof NamespaceRoleSchema>;
export type NamespaceMemberRole = z.infer<typeof NamespaceMemberRoleSchema>;
export type ProjectGrantRole = z.infer<typeof ProjectGrantRoleSchema>;
export type CollaborationStatus = z.infer<typeof CollaborationStatusSchema>;
export type CollaborationInvitationStatus = z.infer<typeof CollaborationInvitationStatusSchema>;
export type NamespaceAction = z.infer<typeof NamespaceActionSchema>;
export type ProjectAction = z.infer<typeof ProjectActionSchema>;

export const CanonicalPrincipalSchema = z
  .object({
    kind: CollaborationPrincipalKindSchema,
    principal_id: ResourceIdSchema,
  })
  .strict();

export const CollaborationPrincipalViewSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('human'),
      principal_id: ResourceIdSchema,
      display_name: z.string().max(200).nullable(),
      email: EmailSchema.nullable(),
      avatar_url: z.url().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('agent'),
      principal_id: ResourceIdSchema,
      display_name: z.string().max(200).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('service'),
      principal_id: ResourceIdSchema,
      display_name: z.string().max(200).nullable(),
    })
    .strict(),
]);

export const NamespaceMembershipSchema = z
  .object({
    membership_id: ResourceIdSchema,
    namespace_id: ResourceIdSchema,
    principal: CollaborationPrincipalViewSchema,
    role: NamespaceRoleSchema,
    status: CollaborationStatusSchema,
    created_at: InstantSchema,
    updated_at: InstantSchema,
  })
  .strict();

export const ProjectGrantSchema = z
  .object({
    grant_id: ResourceIdSchema,
    project_id: ResourceIdSchema,
    principal: CollaborationPrincipalViewSchema,
    role: ProjectGrantRoleSchema,
    status: CollaborationStatusSchema,
    created_at: InstantSchema,
    updated_at: InstantSchema,
    expires_at: InstantSchema.nullable(),
  })
  .strict();

export const CollaborationInvitationRecipientSchema = z
  .object({
    user_id: ResourceIdSchema.nullable(),
    email: EmailSchema.nullable(),
  })
  .strict()
  .refine((recipient) => recipient.user_id !== null || recipient.email !== null, {
    message: 'Invitation recipient requires a user_id or email',
  });

const CollaborationInvitationBaseSchema = z.object({
  invitation_id: ResourceIdSchema,
  recipient: CollaborationInvitationRecipientSchema,
  status: CollaborationInvitationStatusSchema,
  created_by: CanonicalPrincipalSchema,
  created_at: InstantSchema,
  updated_at: InstantSchema,
  expires_at: InstantSchema,
  accepted_at: InstantSchema.nullable(),
  accepted_by_user_id: ResourceIdSchema.nullable(),
  revoked_at: InstantSchema.nullable(),
  expired_at: InstantSchema.nullable(),
});

interface InvitationLifecycleFields {
  status: CollaborationInvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
  expired_at: string | null;
}

function validateInvitationLifecycle(
  invitation: InvitationLifecycleFields,
  context: z.RefinementCtx
): void {
  const lifecycleIsValid =
    (invitation.status === 'pending' &&
      invitation.accepted_at === null &&
      invitation.accepted_by_user_id === null &&
      invitation.revoked_at === null &&
      invitation.expired_at === null) ||
    (invitation.status === 'accepted' &&
      invitation.accepted_at !== null &&
      invitation.accepted_by_user_id !== null &&
      invitation.revoked_at === null &&
      invitation.expired_at === null) ||
    (invitation.status === 'revoked' &&
      invitation.accepted_at === null &&
      invitation.accepted_by_user_id === null &&
      invitation.revoked_at !== null &&
      invitation.expired_at === null) ||
    (invitation.status === 'expired' &&
      invitation.accepted_at === null &&
      invitation.accepted_by_user_id === null &&
      invitation.revoked_at === null &&
      invitation.expired_at !== null);
  if (!lifecycleIsValid) {
    context.addIssue({
      code: 'custom',
      message: 'Invitation status and lifecycle timestamps are inconsistent',
      path: ['status'],
    });
  }
  if (Date.parse(invitation.expires_at) <= Date.parse(invitation.created_at)) {
    context.addIssue({
      code: 'custom',
      message: 'Invitation expiry must be after creation',
      path: ['expires_at'],
    });
  }
}

const NamespaceInvitationSchema = CollaborationInvitationBaseSchema.extend({
  target: z
    .object({
      kind: z.literal('namespace'),
      namespace_id: ResourceIdSchema,
      project_id: z.null(),
    })
    .strict(),
  role: NamespaceMemberRoleSchema,
})
  .strict()
  .superRefine(validateInvitationLifecycle);

const ProjectInvitationSchema = CollaborationInvitationBaseSchema.extend({
  target: z
    .object({
      kind: z.literal('project'),
      namespace_id: ResourceIdSchema,
      project_id: ResourceIdSchema,
    })
    .strict(),
  role: ProjectGrantRoleSchema,
})
  .strict()
  .superRefine(validateInvitationLifecycle);

export const CollaborationInvitationSchema = z.union([
  NamespaceInvitationSchema,
  ProjectInvitationSchema,
]);

export const NamespaceCollaborationInvitationSchema = NamespaceInvitationSchema;
export const ProjectCollaborationInvitationSchema = ProjectInvitationSchema;

export const NamespaceSummarySchema = z
  .object({
    namespace_id: ResourceIdSchema,
    slug: z.string().min(1).max(40),
    kind: z.enum(['personal', 'organization']),
    display_name: z.string().min(1).max(200),
  })
  .strict();

export const NamespaceAccountSchema = z
  .object({
    namespace: NamespaceSummarySchema,
    current_membership: NamespaceMembershipSchema,
    authorized_actions: z.array(NamespaceActionSchema).max(32),
  })
  .strict();

export const ListNamespaceAccountsResponseSchema = z
  .object({
    version: z.literal(COLLABORATION_CONTRACT_VERSION),
    namespaces: z.array(NamespaceAccountSchema).max(1000),
  })
  .strict();

export const ListNamespaceMembersResponseSchema = z
  .object({
    version: z.literal(COLLABORATION_CONTRACT_VERSION),
    namespace_id: ResourceIdSchema,
    authorized_actions: z.array(NamespaceActionSchema).max(32),
    members: z.array(NamespaceMembershipSchema).max(10_000),
  })
  .strict();

export const ListProjectGuestsResponseSchema = z
  .object({
    version: z.literal(COLLABORATION_CONTRACT_VERSION),
    namespace_id: ResourceIdSchema,
    project_id: ResourceIdSchema,
    authorized_actions: z.array(ProjectActionSchema).max(16),
    guests: z.array(ProjectGrantSchema).max(10_000),
  })
  .strict();

export const ListNamespaceInvitationsResponseSchema = z
  .object({
    version: z.literal(COLLABORATION_CONTRACT_VERSION),
    target_kind: z.literal('namespace'),
    namespace_id: ResourceIdSchema,
    project_id: z.null(),
    authorized_actions: z.array(NamespaceActionSchema).max(32),
    invitations: z.array(NamespaceCollaborationInvitationSchema).max(10_000),
  })
  .strict();

export const ListProjectInvitationsResponseSchema = z
  .object({
    version: z.literal(COLLABORATION_CONTRACT_VERSION),
    target_kind: z.literal('project'),
    namespace_id: ResourceIdSchema,
    project_id: ResourceIdSchema,
    authorized_actions: z.array(ProjectActionSchema).max(16),
    invitations: z.array(ProjectCollaborationInvitationSchema).max(10_000),
  })
  .strict();

export const ListCollaborationInvitationsResponseSchema = z.discriminatedUnion('target_kind', [
  ListNamespaceInvitationsResponseSchema,
  ListProjectInvitationsResponseSchema,
]);

export const UpsertNamespaceMemberRequestSchema = z
  .object({
    principal: CanonicalPrincipalSchema,
    role: NamespaceMemberRoleSchema,
  })
  .strict();

export const UpsertProjectGuestRequestSchema = z
  .object({
    principal: CanonicalPrincipalSchema,
    role: ProjectGrantRoleSchema,
    expires_at: InstantSchema.nullable(),
  })
  .strict();

const CreateInvitationRequestBaseSchema = z.object({
  recipient: CollaborationInvitationRecipientSchema,
  expires_at: InstantSchema,
});

export const CreateNamespaceInvitationRequestSchema = CreateInvitationRequestBaseSchema.extend({
  role: NamespaceMemberRoleSchema,
}).strict();

export const CreateProjectInvitationRequestSchema = CreateInvitationRequestBaseSchema.extend({
  role: ProjectGrantRoleSchema,
}).strict();

export const CollaborationInvitationTokenSchema = z.string().regex(/^t3xi_v1_[A-Za-z0-9_-]{43}$/);

export const AcceptCollaborationInvitationRequestSchema = z
  .object({
    token: CollaborationInvitationTokenSchema,
  })
  .strict();

export const TransferNamespaceOwnershipRequestSchema = z
  .object({
    target_membership_id: ResourceIdSchema,
  })
  .strict();

export const TransferProjectRequestSchema = z
  .object({
    target_namespace_id: ResourceIdSchema,
  })
  .strict();

/** Raw invitation tokens are isolated to this one-time delivery envelope. */
export const CollaborationInvitationDeliverySchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('email_queued'),
      token: z.null(),
    })
    .strict(),
  z
    .object({
      mode: z.literal('manual'),
      token: CollaborationInvitationTokenSchema,
    })
    .strict(),
]);

export const CreateCollaborationInvitationResponseSchema = z
  .object({
    invitation: CollaborationInvitationSchema,
    delivery: CollaborationInvitationDeliverySchema,
  })
  .strict();

export const CollaborationMutationResultSchema = z
  .object({
    request_id: ResourceIdSchema,
    kind: z.enum([
      'namespace_member.upsert',
      'namespace_member.revoke',
      'project_guest.grant',
      'project_guest.revoke',
      'project.transfer',
      'invitation.create',
      'invitation.accept',
      'invitation.revoke',
      'namespace_ownership.transfer',
    ]),
    outcome: z.enum(['applied', 'unchanged']),
    evaluated_at: InstantSchema,
  })
  .strict();

export type CanonicalPrincipal = z.infer<typeof CanonicalPrincipalSchema>;
export type CollaborationPrincipalView = z.infer<typeof CollaborationPrincipalViewSchema>;
export type NamespaceMembership = z.infer<typeof NamespaceMembershipSchema>;
export type ProjectGrant = z.infer<typeof ProjectGrantSchema>;
export type CollaborationInvitationRecipient = z.infer<
  typeof CollaborationInvitationRecipientSchema
>;
export type CollaborationInvitation = z.infer<typeof CollaborationInvitationSchema>;
export type NamespaceCollaborationInvitation = z.infer<
  typeof NamespaceCollaborationInvitationSchema
>;
export type ProjectCollaborationInvitation = z.infer<typeof ProjectCollaborationInvitationSchema>;
export type NamespaceSummary = z.infer<typeof NamespaceSummarySchema>;
export type NamespaceAccount = z.infer<typeof NamespaceAccountSchema>;
export type ListNamespaceAccountsResponse = z.infer<typeof ListNamespaceAccountsResponseSchema>;
export type ListNamespaceMembersResponse = z.infer<typeof ListNamespaceMembersResponseSchema>;
export type ListProjectGuestsResponse = z.infer<typeof ListProjectGuestsResponseSchema>;
export type ListNamespaceInvitationsResponse = z.infer<
  typeof ListNamespaceInvitationsResponseSchema
>;
export type ListProjectInvitationsResponse = z.infer<typeof ListProjectInvitationsResponseSchema>;
export type ListCollaborationInvitationsResponse = z.infer<
  typeof ListCollaborationInvitationsResponseSchema
>;
export type UpsertNamespaceMemberRequest = z.infer<typeof UpsertNamespaceMemberRequestSchema>;
export type UpsertProjectGuestRequest = z.infer<typeof UpsertProjectGuestRequestSchema>;
export type CreateNamespaceInvitationRequest = z.infer<
  typeof CreateNamespaceInvitationRequestSchema
>;
export type CreateProjectInvitationRequest = z.infer<typeof CreateProjectInvitationRequestSchema>;
export type CollaborationInvitationToken = z.infer<typeof CollaborationInvitationTokenSchema>;
export type AcceptCollaborationInvitationRequest = z.infer<
  typeof AcceptCollaborationInvitationRequestSchema
>;
export type TransferNamespaceOwnershipRequest = z.infer<
  typeof TransferNamespaceOwnershipRequestSchema
>;
export type TransferProjectRequest = z.infer<typeof TransferProjectRequestSchema>;
export type CollaborationInvitationDelivery = z.infer<typeof CollaborationInvitationDeliverySchema>;
export type CreateCollaborationInvitationResponse = z.infer<
  typeof CreateCollaborationInvitationResponseSchema
>;
export type CollaborationMutationResult = z.infer<typeof CollaborationMutationResultSchema>;
