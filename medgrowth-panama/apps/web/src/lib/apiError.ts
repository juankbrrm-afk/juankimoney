import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "./rbac";

export function handleApiError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: { code: "unauthorized", message: err.message } }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: { code: "validation_error", message: err.message } }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: { code: "internal_error", message: "Error inesperado" } }, { status: 500 });
}
