import { useApi } from './useApi.js';
import { categoriesApi, itemsApi, suppliersApi } from '../services/endpoints.js';

/** Categories for filters and forms. */
export function useCategories() {
  const { data, loading, reload } = useApi(() => categoriesApi.list(), []);
  return { categories: data?.data || [], loading, reload };
}

/** Suppliers for selects (management roles only). */
export function useSuppliers({ enabled = true, activeOnly = false } = {}) {
  const { data, loading } = useApi(() => suppliersApi.list({ limit: 200, status: activeOnly ? 'active' : undefined }), [activeOnly], { enabled });
  return { suppliers: data?.data || [], loading };
}

/** All items (id, name, unit, cost) for pickers. */
export function useItemOptions({ enabled = true } = {}) {
  const { data, loading } = useApi(() => itemsApi.list({ limit: 200, sort: 'name' }), [], { enabled });
  return { items: data?.data || [], loading };
}
