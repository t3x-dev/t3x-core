/**
 * Dev SQL Execution Route
 *
 * POST /api/dev/sql - Execute raw SQL (development + explicit opt-in only)
 *
 * SECURITY: This route only works in development mode when
 * T3X_ENABLE_DEV_SQL=true is set.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { executeRawSQL } from '@/infrastructure/db';

function devSqlDisabledResponse() {
  if (process.env.NODE_ENV === 'development' && process.env.T3X_ENABLE_DEV_SQL === 'true') {
    return null;
  }

  return NextResponse.json(
    {
      error:
        'This endpoint is only available when NODE_ENV=development and T3X_ENABLE_DEV_SQL=true',
    },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  const disabled = devSqlDisabledResponse();
  if (disabled) return disabled;

  try {
    const { sql } = await request.json();

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    const rows = await executeRawSQL(sql);

    return NextResponse.json({
      rows,
      rowCount: rows.length,
    });
  } catch (error) {
    console.error('[dev/sql POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET endpoint for table info
export async function GET() {
  const disabled = devSqlDisabledResponse();
  if (disabled) return disabled;

  try {
    const tables = await executeRawSQL(`
      SELECT tablename as name
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    // Get row counts for each table
    const tableInfo = await Promise.all(
      (tables as { name: string }[]).map(async (t) => {
        const countResult = await executeRawSQL(`SELECT COUNT(*) as count FROM "${t.name}"`);
        const countRow = countResult[0] as { count: number } | undefined;
        return {
          name: t.name,
          rowCount: Number(countRow?.count || 0),
        };
      })
    );

    return NextResponse.json({ tables: tableInfo });
  } catch (error) {
    console.error('[dev/sql GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
