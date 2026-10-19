import { z } from 'zod';

export const REPOSITORY_README_MAX_BYTES = 128 * 1024;
export const REPOSITORY_TAGS_MAX_COUNT = 32;
export const REPOSITORY_TAG_MAX_LENGTH = 64;

export const RepositoryReadmeSchema = z
  .string()
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= REPOSITORY_README_MAX_BYTES,
    'README must be at most 128 KiB of UTF-8 text.'
  )
  .describe('Markdown, at most 128 KiB UTF-8. An empty string clears the README.');

// Normalize before checking limits; preserve case and first occurrence order.
export const RepositoryTagsSchema = z
  .array(z.string())
  .transform((tags) => [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))])
  .pipe(
    z
      .array(
        z
          .string()
          .refine(
            (tag) => Array.from(tag).length <= REPOSITORY_TAG_MAX_LENGTH,
            'Each tag must be at most 64 characters.'
          )
      )
      .max(REPOSITORY_TAGS_MAX_COUNT, 'Use at most 32 tags.')
  )
  .describe(
    'At most 32 tags of 64 Unicode characters after trimming, ignoring blanks and exact duplicates. Case and order are preserved. An empty array clears tags.'
  );

/** Current project information; never resolved from a branch or Commit. */
export const RepositoryProfileSchema = z.object({
  readme: RepositoryReadmeSchema,
  tags: RepositoryTagsSchema,
});
export const RepositoryProfilePatchSchema = RepositoryProfileSchema.partial()
  .strict()
  .describe(
    'Only supplied fields change. Omitted fields are preserved atomically; null is not accepted. Does not create a Commit or advance a branch.'
  );
export type RepositoryProfile = z.infer<typeof RepositoryProfileSchema>;
export type RepositoryProfilePatch = z.input<typeof RepositoryProfilePatchSchema>;

/** Only called on creation, after the existing name contract has confirmed the name. */
export function initialRepositoryReadme(name: string, description?: unknown): string {
  const body = typeof description === 'string' ? description.trim() : '';
  return `# ${name}${body ? `\n\n${body}` : ''}\n`;
}
