import { Request } from 'express';

export interface PaginationParams {
  limit: number;
  cursor: { id: string; created_at: string } | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 5000;

export function parsePagination(req: Request): PaginationParams {
  const limitParam = parseInt(req.query.limit as string, 10);
  const limit = isNaN(limitParam) ? DEFAULT_LIMIT : Math.min(Math.max(limitParam, 1), MAX_LIMIT);

  let cursor: PaginationParams['cursor'] = null;
  const cursorParam = req.query.cursor as string;
  if (cursorParam) {
    try {
      const decoded = Buffer.from(cursorParam, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed.id && parsed.created_at) {
        cursor = parsed;
      }
    } catch {
      // Invalid cursor, ignore
    }
  }

  return { limit, cursor };
}

export function encodeCursor(id: string, created_at: string): string {
  return Buffer.from(JSON.stringify({ id, created_at })).toString('base64');
}

export function buildPaginationResponse(
  data: any[],
  limit: number,
  totalCount: number,
) {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const lastItem = items[items.length - 1];

  return {
    data: items,
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore && lastItem ? encodeCursor(lastItem.id, lastItem.created_at) : null,
      total_count: totalCount,
    },
  };
}
