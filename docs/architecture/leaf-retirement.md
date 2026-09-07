# Legacy Leaf access

Generated Leaf creation is retired. Use the State or Commit export action for
versioned delivery. Full-State export preserves the stored representation; it
is not necessarily a deployable configuration or a complete project backup.

Historical Leaf records and their attribution remain readable/exportable through
legacy interfaces. Retirement does not authorize deleting database history,
source pins, validation statements or billing evidence. A tree leaf node and the
public Transition leaf package are unrelated to the retired output feature.

`node tools/leaf-retirement-audit.mjs` inventories remaining route compatibility
without contacting a database. Operators may request a scoped read-only scan:

```sh
node tools/leaf-retirement-audit.mjs --project PROJECT_ID --database-url-env T3X_AUDIT_DATABASE_URL
```

The scan uses a read-only transaction and reports aggregate counts. It does not
authorize deletion or establish a complete archive. See the [archive verification
contract](project-archive-verification.md) for the archive boundary.
