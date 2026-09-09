# Exact committed State export

Implements the first YAML/JSON delivery slice of #1503 and #1504 under #1499.

`GET /v1/commits/{digest}/export?project_id=…&format=json|yaml` requires an exact
CommitV2 digest and project read access. Optional `state_digest` is an additional
caller expectation. The server reads the verified project-bound commit graph;
it never resolves HEAD or uses the semantic tree projection to reconstruct the
value. A missing object fails rather than selecting another revision.

The response contains the complete State **value**, serialized as UTF-8 text,
plus the source commit and State descriptors, codec, serialization version,
filename, MIME type, byte length and SHA-256 of the file bytes. Artifact hashes
are ordinary byte hashes, distinct from domain-separated protocol object hashes.

JSON uses ordered keys and two-space indentation. YAML uses the JSON-compatible
schema, ordered keys, quoted strings and no aliases. Both end with a newline.
This is deterministic value serialization, not preservation of source YAML
comments, ordering, anchors or formatting. No model, Leaf, validation run or
renderer is required. Changing the serialization options requires a new
serialization version.

State and historical Commit views share one Export dialog. Before downloading,
the browser checks the returned revision, format, byte length and artifact hash.
It reports “Download started,” which does not imply deployment or validation.
Requests do not mutate commits, create Leaves or append historical delivery rows.

Only full State values and YAML/JSON are supported in this slice. No renderer
format is advertised until #1316 provides a qualified renderer export capability.
Presentation resources are not fetched or appended. If a business State itself
contains a field named `readme`, that field remains part of its full value; field
names are not guessed to be presentation resources. Exports are not full project
backups (#1418), semantic subset exports, deployment adapters or validation
certificates. Schema binding and validation resolution remain separate concerns
and are not inferred from tags or the export format.
