"use client";

import { useEffect } from "react";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function ApiTokenInjector() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = input instanceof Request ? input.url : input.toString();
      const isInternalApiCall = new URL(url, window.location.origin).pathname.startsWith("/api/");

      if (MUTATING_METHODS.has(method) && isInternalApiCall) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("x-api-token", process.env.NEXT_PUBLIC_API_TOKEN ?? "");
        return originalFetch(input, { ...init, headers });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
