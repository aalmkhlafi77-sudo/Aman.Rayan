import type { Request, Response } from 'express';
import { pool } from '../db/pool';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      databaseReady: true,
    });
  } catch {
    res.status(503).json({
      ok: false,
      databaseReady: false,
    });
  }
}
