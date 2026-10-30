import { useEffect, useState } from "react";

/** Debounces a rapidly changing value (search boxes) without extra dependencies. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function usePageSize(initial = 20) {
  return useState(initial);
}
