/**
 * Optimistic UI Update Hook
 * Provides instant feedback for user actions while syncing with backend
 */

import { useState, useCallback, useRef } from "react";

interface OptimisticOptions<T> {
  /** Initial data */
  initialData: T;
  /** Function to execute the actual update */
  onUpdate: (newData: T) => Promise<void>;
  /** Optional rollback handler */
  onError?: (error: Error, previousData: T) => void;
  /** Debounce time in ms (default: 0) */
  debounceMs?: number;
}

export function useOptimisticUpdate<T>({
  initialData,
  onUpdate,
  onError,
  debounceMs = 0,
}: OptimisticOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [isPending, setIsPending] = useState(false);
  const previousDataRef = useRef<T>(initialData);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    async (newData: T) => {
      // Store previous data for potential rollback
      previousDataRef.current = data;

      // Optimistically update UI immediately
      setData(newData);
      setIsPending(true);

      // Clear any pending debounced update
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const executeUpdate = async () => {
        try {
          await onUpdate(newData);
        } catch (error) {
          // Rollback on error
          setData(previousDataRef.current);
          if (onError) {
            onError(error as Error, previousDataRef.current);
          }
        } finally {
          setIsPending(false);
        }
      };

      if (debounceMs > 0) {
        debounceRef.current = setTimeout(executeUpdate, debounceMs);
      } else {
        await executeUpdate();
      }
    },
    [data, onUpdate, onError, debounceMs]
  );

  const reset = useCallback((newData: T) => {
    setData(newData);
    previousDataRef.current = newData;
    setIsPending(false);
  }, []);

  return {
    data,
    update,
    reset,
    isPending,
  };
}

/**
 * Optimistic list operations
 * For adding/removing items from lists with instant feedback
 */
export function useOptimisticList<T extends { id: string }>({
  initialItems,
  onAdd,
  onRemove,
}: {
  initialItems: T[];
  onAdd?: (item: T) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const addItem = useCallback(
    async (item: T) => {
      // Optimistically add item
      setItems((prev) => [item, ...prev]);
      setPendingIds((prev) => new Set(prev).add(item.id));

      try {
        if (onAdd) {
          await onAdd(item);
        }
      } catch (error) {
        // Rollback on error
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [onAdd]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const itemToRemove = items.find((i) => i.id === id);
      if (!itemToRemove) return;

      // Optimistically remove item
      setItems((prev) => prev.filter((i) => i.id !== id));
      setPendingIds((prev) => new Set(prev).add(id));

      try {
        if (onRemove) {
          await onRemove(id);
        }
      } catch (error) {
        // Rollback on error
        setItems((prev) => [itemToRemove, ...prev]);
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, onRemove]
  );

  const reset = useCallback((newItems: T[]) => {
    setItems(newItems);
    setPendingIds(new Set());
  }, []);

  return {
    items,
    addItem,
    removeItem,
    reset,
    isPending: (id: string) => pendingIds.has(id),
    hasPendingItems: pendingIds.size > 0,
  };
}
