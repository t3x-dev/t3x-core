# Native Studio sample qualification

The preview reads the `starter` JSON from each authorized, digest-verified release. Samples are checked independently against the current compiled selection. They are not silently merged or copied during definition adoption. Local sample requests are read-only and bounded to 64 KiB, 24 levels and 10,000 values.

Actual production API/Web/PostgreSQL journey: Discover → Browse → release README → add exact candidate → author sample → remove required field → native issues → repair → fresh passing check. Separate browser-only Workspace author/repair/review/commit/export journey also passed after the new default preview. No AI keys, no mocked responses.

Reference `../../05-studio.png` and `starters-studio.png` were opened together, then the implementation was refined. The first renderer exposed too much recursive JSON chrome and pushed the routine title below the fold. The second uses compact named-row tables only for schema-declared repeated nodes with scalar fields, preserving all actual fields and distinguishing absent values. Complex records retain generic reading. Native sample status is adjacent to the sample, while definition/adoption and external execution remain separate in the existing sidebar.

Local edits immediately clear old validation; late responses cannot mark a newer edit passed. Selection/version changes remount the sample editor. Source and compiled hashes remain visible through X-ray. Browser repair and mobile screenshots are attached. This is a sample preview, not runtime success or an external ecosystem validator.

Validation: Studio API integration 6 passed (exact source, invalid/fixed local sample, combined selection, size/depth limits and unchanged Workspace); browser journeys 2 passed; Web regression tests cover late responses and selection reset.
