"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";

export type Resource<T> = {
  data: T | undefined;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/** Reads a GET endpoint. Payment/hardware state is never cached or optimistically updated. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await api.get<T>(path);
      if (current.current === path) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (current.current === path) setError(err as Error);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Runs a mutation while blocking duplicate submissions and exposing a readable error. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, onDone?: (result: R) => void | Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      setMessage(null);
      try {
        const result = await fn(...args);
        await onDone?.(result);
        return result;
      } catch (err) {
        setError(errorMessage(err));
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fn, onDone],
  );

  return { run, pending, error, message, setMessage, setError };
}

/** Reads a form into a plain object; blank inputs are omitted so optional schema fields stay undefined. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  });
  return out;
}

export const toInt = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number.parseInt(v, 10));
