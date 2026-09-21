import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paged } from '@erp/shared';
import { http } from './client';

export interface ListParams { page?: number; pageSize?: number; search?: string; sort?: string; filters?: string }

/** List + CRUD hooks for any resource exposed by crud-routes. */
export function useList<T>(resource: string, params: ListParams = {}) {
  return useQuery({ queryKey: [resource, 'list', params], queryFn: () => http.get<Paged<T>>(`/${resource}`, params as Record<string, unknown>) });
}

export function useAll<T>(resource: string, extra: Record<string, unknown> = {}) {
  return useQuery({ queryKey: [resource, 'all', extra], queryFn: () => http.get<Paged<T>>(`/${resource}`, { pageSize: 200, ...extra }).then((r) => r.rows) });
}

export function useSave<T>(resource: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: unknown }) => (id ? http.put<T>(`/${resource}/${id}`, data) : http.post<T>(`/${resource}`, data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
  });
}

export function useRemove(resource: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.del(`/${resource}/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }) });
}
