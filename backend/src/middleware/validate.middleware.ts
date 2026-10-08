import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

// Accepts any Zod schema, including ones with cross-field .refine() rules.
export const validateBody = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
};
