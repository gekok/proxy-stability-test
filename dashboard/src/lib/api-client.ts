const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const DEFAULT_TIMEOUT = 10000;

interface ApiResponse<T> {
  data: T;
  pagination?: {
    has_more: boolean;
    next_cursor: string | null;
    total_count: number;
  };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(
    method: string,
    endpoint: string,
    options?: {
      body?: unknown;
      params?: Record<string, string>;
      timeout?: number;
      suppressNotFound?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const timeout = options?.timeout || DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    console.debug('[api-client] API call start', { method, endpoint, params: options?.params });

    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration_ms = Date.now() - startTime;

      if (response.status === 204) {
        console.debug('[api-client] API call success (no content)', {
          method, endpoint, duration_ms, status_code: 204,
        });
        return { data: null as T };
      }

      let body: unknown;
      const rawText = await response.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        console.error('[api-client] API response parse error', {
          method, endpoint, status_code: response.status,
          raw_body: rawText.substring(0, 200),
        });
        throw new Error(`Invalid JSON response from ${method} ${endpoint}`);
      }

      if (response.status === 404 && options?.suppressNotFound) {
        console.debug('[api-client] API call not found (suppressed)', {
          method, endpoint, duration_ms, status_code: 404,
        });
        return { data: null as T };
      }

      if (response.status >= 400 && response.status < 500) {
        const apiError = body as ApiError;
        console.warn('[api-client] API client error (4xx)', {
          method, endpoint, status_code: response.status,
          error_detail: apiError.error?.message,
          validation_errors: apiError.error?.details,
        });
        throw new ApiClientError(response.status, apiError.error?.message || 'Client error', apiError.error?.details);
      }

      if (response.status >= 500) {
        const apiError = body as ApiError;
        console.error('[api-client] API server error (5xx)', {
          method, endpoint, status_code: response.status,
          error_detail: apiError.error?.message,
        });
        throw new ApiServerError(response.status, apiError.error?.message || 'Server error');
      }

      console.debug('[api-client] API call success', {
        method, endpoint, duration_ms, status_code: response.status,
      });

      return body as ApiResponse<T>;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiClientError || error instanceof ApiServerError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('[api-client] API timeout', {
          method, endpoint, timeout_ms: timeout, api_url: this.baseUrl,
        });
        throw new ApiTimeoutError(timeout, endpoint);
      }

      if (error instanceof TypeError && error.message.includes('ECONNREFUSED')) {
        console.error('[api-client] API connection refused', {
          api_url: this.baseUrl, error_detail: 'ECONNREFUSED',
        });
        throw new ApiUnreachableError('Connection refused — API service may be down');
      }

      console.error('[api-client] API unreachable', {
        api_url: this.baseUrl,
        error_detail: error instanceof Error ? error.message : String(error),
      });
      throw new ApiUnreachableError(
        error instanceof Error ? error.message : 'Network error'
      );
    }
  }

  get<T>(endpoint: string, params?: Record<string, string>, opts?: { suppressNotFound?: boolean }) {
    return this.request<T>('GET', endpoint, { params, ...opts });
  }
  post<T>(endpoint: string, body: unknown) {
    return this.request<T>('POST', endpoint, { body });
  }
  put<T>(endpoint: string, body: unknown) {
    return this.request<T>('PUT', endpoint, { body });
  }
  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
  }
}
export class ApiServerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiServerError';
  }
}
export class ApiTimeoutError extends Error {
  constructor(public timeout_ms: number, public endpoint: string) {
    super(`Request to ${endpoint} timed out after ${timeout_ms}ms`);
    this.name = 'ApiTimeoutError';
  }
}
export class ApiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

export const apiClient = new ApiClient(API_URL);
