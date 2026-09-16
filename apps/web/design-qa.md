# New pull request design QA

- Source: `/Users/wangyaxin/.codex/attachments/3751876b-a531-4694-a39c-f53782a29add/pasted-text.txt`
- Implementation: `/t3x-dev/test-bug/pull-requests`, create state
- Comparison viewport: 1264 x 712
- Comparison method: rendered source and implementation inspected at the same viewport; implementation coordinates are normalized below the preserved project shell.

## Geometry comparison

| Element | Source | Implementation | Result |
| --- | ---: | ---: | --- |
| Left column | 725 px | 725 px | match |
| Right card | 420 x 663.5 px | 420 x 663.5 px | match |
| Column gap | 40 px | 40 px | match |
| Title input | 725 x 44.5 px | 725 x 44 px | pass |
| Description | 725 x 120 px | 725 x 120 px | match |
| Change preview | 725 x 258.5 px | 725 x 258.47 px | match |

## Visual review

- P0: none.
- P1: none.
- P2: none.
- P3: live branch names and commit data are longer than the sample source content, so the existing truncation rules are visible in the live page.

The project shell remains intact. The create flow still uses the existing compare, form, refresh, validation, create, and return-to-list behavior.

final result: passed
