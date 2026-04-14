/**
 * Dev SQL Execution Route
 *
 * POST /api/dev/sql - Execute raw SQL (development only)
 *
 * SECURITY: This route only works in development mode.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { executeRawSQL } from '@/infrastructure/db';

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

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
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

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
