import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/api.js';

/**
 * Loads data from an API function and tracks loading/error state.
 * `deps` re-run the request; stale responses from earlier requests are ignored.
 */
export function useApi(fn, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      if (id === requestId.current) setData(res);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
