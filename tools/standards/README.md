# Standards Runner

`pnpm standards:run` executes the committed alpha standards matrix.

Child row commands must write one JSON object to stdout:

```json
{
  "row_id": "row-6",
  "status": "pass",
  "summary": "Contributor files are present.",
  "details": ["Optional detail lines."]
}
```

`status` must be one of `pass`, `fail`, `manual`, or `skipped`. The runner treats
any invalid JSON output as a failed row.
