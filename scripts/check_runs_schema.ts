import { PGlite } from '@electric-sql/pglite';

async function main() {
  const client = new PGlite('./.t3x/data/');
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'runs'
    ORDER BY ordinal_position
  `);
  console.log('Columns in runs table:');
  (result.rows as Array<{ column_name: string }>).forEach((row) =>
    console.log(' -', row.column_name)
  );
  await client.close();
}

main().catch(console.error);
