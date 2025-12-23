/**
 * Dev SQL Execution Route
 *
 * POST /api/dev/sql - Execute raw SQL (development only)
 *
 * SECURITY: This route only works in development mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB, getRawClient } from '@/lib/db';

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
      return NextResponse.json(
        { error: 'SQL query is required' },
        { status: 400 }
      );
    }

    // Ensure DB is initialized and get raw client
    await getDB();
    const client = getRawClient();
    const result = await client.query(sql);

    return NextResponse.json({
      rows: result.rows,
      rowCount: result.rows.length,
      fields: result.fields?.map((f: { name: string; dataTypeID: number }) => ({
        name: f.name,
        dataTypeID: f.dataTypeID,
      })),
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
    await getDB();
    const client = getRawClient();

    // Get table names and row counts
    const tables = await client.query(`
      SELECT
        tablename as name,
        (SELECT COUNT(*) FROM pg_catalog.pg_tables) as table_count
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    // Get row counts for each table
    const tableRows = tables.rows as { name: string }[];
    const tableInfo = await Promise.all(
      tableRows.map(async (t) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as count FROM "${t.name}"`
        );
        const countRow = countResult.rows[0] as { count: number } | undefined;
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
