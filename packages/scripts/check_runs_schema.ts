import postgres from 'postgres';

async function main() {
  const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
  const connectionString = `postgresql://postgres:password@localhost:${port}/t3x`;
  const sql = postgres(connectionString);

  try {
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'runs'
      ORDER BY ordinal_position
    `;
    console.log('Columns in runs table:');
    (result as Array<{ column_name: string }>).forEach((row) =>
      console.log(' -', row.column_name)
    );
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
