export type XtreamErrorCode = 'AUTH_FAILED' | 'NETWORK' | 'BLOCKED' | 'SLOT_BUSY' | 'OFFLINE' | 'HTTP' | 'PARSE';

export class XtreamError extends Error {
  code: XtreamErrorCode;
  httpStatus?: number;

  constructor(code: XtreamErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = 'XtreamError';
    this.code = code;
    if (httpStatus !== undefined) {
      this.httpStatus = httpStatus;
    }
    // Keep `instanceof` working even when classes are down-levelled by Babel/Hermes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isXtreamError(err: unknown, code?: XtreamErrorCode): err is XtreamError {
  if (!(err instanceof XtreamError)) {
    // Cross-realm safety (e.g. Jest module registry resets): duck-type on name + code.
    const e = err as { name?: unknown; code?: unknown } | null;
    if (!e || typeof e !== 'object' || e.name !== 'XtreamError' || typeof e.code !== 'string') {
      return false;
    }
    return code === undefined || e.code === code;
  }
  return code === undefined || err.code === code;
}
