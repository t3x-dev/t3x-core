# Versioned author content for State

Implements the backend contract in #1509 (Epic #1500). Overview consumes this
contract in #1510/#1511; this PR does not add an editor or change the State UI.

## Author fields

`description` is plain author text (empty is allowed). `readme`, `avatarPath`,
`tags`, and `resources` are optional. No Purpose, Includes, generated summary,
cover image, or category-specific fields are required.

README is authored Markdown source. Additional images belong to README;
`avatarPath` refers to one small identity image from the same resource bundle.
Tags preserve author spelling and accept custom or official vocabulary strings.
Alias display and catalog facets belong to the catalog; tags never choose a
schema, validator, renderer, or module boundary.

## Publication and identity

The existing schema artifact registry has immutable manifest versions, but its
catalog description/tags are mutable and it is not the owner of every generic
JSON project. We therefore use a separate application sidecar bound to an exact
project/CommitV2 pair. The user value and protocol objects are unchanged.

- `POST /v1/projects/{projectId}/commits/{commitDigest}/presentation` uploads and
  publishes one complete bundle. It requires project edit authority and verifies
  that the exact commit graph belongs to that project.
- First publication wins atomically. Repeating the same content returns the
  original timestamp/actor; different content for the same commit returns 409.
- To edit author content, publish it with a new commit. A documentation-only
  revision can use the same business State value; integration tests cover that
  path through the existing commit use case. UI authoring is separate work.
- `GET` on the same path requires project read authority. Missing optional content
  returns `presentation: null`, rather than a generated introduction or HEAD data.
- Consumers may pin `?presentation_digest=sha256:...`; a mismatch fails closed.
  Release/Studio references should retain both the commit and presentation digest.

The sidecar digest hashes its normalized application document, including README,
image bytes, image alt text, and exact author tags. Resource order and tag order
are normalized with locale-independent sorting. Each image also has a byte hash.
The server verifies the sidecar again on read. Author identity and publication
time are separate audit metadata. A sidecar is not included in CommitV2 identity
and must not be presented as if the commit hash attests to it.

Business YAML/JSON export contains only State.value. Exporting the sidecar uses
the separate GET response. No presentation fields are inserted into arbitrary
JSON roots, including schema-definition projects.

## Resource and rendering contract

The first upload adapter accepts embedded PNG/JPEG/WebP resources. It checks
canonical base64, media type/file extension/signature agreement, and these limits:

| Item | Limit |
| --- | --- |
| Description | 4 KiB UTF-8 |
| README | 128 KiB UTF-8 |
| Tags | 32, each up to 64 characters |
| Resource path | 200 characters; relative ASCII path; no traversal |
| Image alt text | Required, up to 512 characters |
| Images | 16 maximum; 512 KiB each; 2 MiB total |
| HTTP publication body | 4 MiB |

Image signatures are checked; this does not claim pixel decoding or image
optimization. SVG and HTML are not accepted as image resources. The API returns
JSON containing the bundle, not executable image/HTML responses.

Consumers must disable raw HTML in Markdown. `resolvePresentationLink` resolves
only bundled relative images, local fragment links, and credential-free HTTPS
hyperlinks. Unknown relative links, traversal, executable schemes, and remote
image URLs remain inert. No external URLs are fetched by publication or reading.
The frontend must use these constraints when rendering the stored author source.

Removing a README image means omitting it from a later publication; historical
bundles retain their bytes. There is no resource-delete or sidecar-update API.
Project soft deletion hides the project using existing authorization; restoration
recovers the same bundle. Schema v74 uses a restrictive project foreign key so a
physical project deletion cannot silently cascade away historical author content.
Explicit permanent-purge policy remains a separate lifecycle decision.

## Verification

- 9 application tests: deterministic identity, optional content, path/MIME/base64,
  limits, required alt text, and safe resource/link resolution.
- 9 PostgreSQL route tests: exact versions, concurrent duplicate publication,
  immutable rejection, foreign membership, viewer/write separation, corruption,
  size limit, soft-delete/restore and documentation-only commits.
- Existing exact State export tests confirm sidecar-free business output.
- 18 PostgreSQL migration tests, including v73→v74 and retained project data.
- API client runtime contracts and full client suite; repository checks/build.

Archive manifest extension and full archive restore remain owned by #1418; the
new sidecar GET makes the author bundle exportable, but this PR does not claim
that the generic project archive pipeline already includes it.
