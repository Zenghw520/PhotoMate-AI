import type { ApiErrorBody } from "./shared/contracts.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const body: ApiErrorBody = {
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "摄影服务暂时无法完成请求，请稍后重试。",
      retryable: known ? error.retryable : true,
    },
  };
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
