import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../lib/errors";

type Source = "body" | "query" | "params";

export function validate<T>(schema: ZodType<T>, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        AppError.badRequest("Request validation failed", {
          source,
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        })
      );
    }
    if (source === "body") req.body = result.data;
    else if (source === "query") Object.assign(req.query, result.data);
    else req.params = result.data as Request["params"];
    next();
  };
}
