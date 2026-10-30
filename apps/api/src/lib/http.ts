import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.json({
    success: true,
    data,
    ...(meta ? { meta: { requestId: res.locals.requestId, ...meta } } : {}),
  });
}

export function created<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.status(201).json({
    success: true,
    data,
    ...(meta ? { meta: { requestId: res.locals.requestId, ...meta } } : {}),
  });
}

export function paginated<T>(res: Response, items: T[], total: number, page: number, pageSize: number) {
  return res.json({
    success: true,
    data: items,
    meta: {
      requestId: res.locals.requestId,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export function skipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Convert Prisma Decimal / Date / BigInt into stable JSON primitives. */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    })
  ) as T;
}

export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}
