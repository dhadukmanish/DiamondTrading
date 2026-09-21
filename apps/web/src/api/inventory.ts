import { useQuery } from '@tanstack/react-query';
import { http } from './client';

export interface VariantOption { variantId: string; productId: string; productName: string; variantName: string; sku: string; stockType: string; unitId: string | null; purchasePrice: number; sellingPrice: number; stock: number }
export const useVariantSearch = (term: string, stockType = 'all') =>
  useQuery({ queryKey: ['variants', 'search', term, stockType], queryFn: () => http.get<VariantOption[]>('/products/search', { term, stockType }), enabled: term.length > 0 });

export interface StockRow { variantId: string; productId: string; productName: string; variantName: string; sku: string; unit: string | null; stockType: string; purchasePrice: number; sellingPrice: number; stockReminder: number; totalIn: number; totalOut: number; qty: number; pcs: number; soCommitted: number; poCommitted: number; saleableQty: number; value: number; avgRate: number; lowStock: boolean }
export const useStock = (params: Record<string, unknown>) => useQuery({ queryKey: ['stock', params], queryFn: () => http.get<StockRow[]>('/inventory/stock', params) });

export interface HistoryRow { id: string; date: string; branchName: string | null; contactName: string | null; docNo: string | null; sourceType: string; direction: 'in' | 'out'; qty: number; pcs: number; rate: number; value: number; note: string | null; runningQty: number; runningPcs: number }
export const useHistory = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: ['history', params], queryFn: () => http.get<HistoryRow[]>('/inventory/history', params), enabled });

export interface LotRow { id: string; receivedAt: string; branchName: string | null; docNo: string | null; qtyIn: number; qtyRemaining: number; pcsIn: number; pcsRemaining: number; rate: number; value: number }
export const useLots = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: ['lots', params], queryFn: () => http.get<LotRow[]>('/inventory/lots', params), enabled });

export interface Journal { id: string; docNo: string; date: string; lines: { id: string; accountName: string; debit: number; credit: number; narration: string | null }[] }
export const useJournal = (sourceType: string, sourceId?: string) =>
  useQuery({ queryKey: ['journal', sourceType, sourceId], queryFn: () => http.get<Journal | null>('/journal/by-source', { sourceType, sourceId }), enabled: !!sourceId });

export interface SeriesOption { id: string; prefix: string; seriesType: string; isDefault: boolean }
export const useSeriesFor = (docType: string, firmId?: string, branchId?: string) =>
  useQuery({ queryKey: ['series', docType, firmId, branchId], queryFn: () => http.get<SeriesOption[]>('/document-series/for', { docType, firmId, branchId }), enabled: !!firmId });
export const useSeriesPreview = (seriesId?: string, date?: string) =>
  useQuery({ queryKey: ['series-preview', seriesId, date], queryFn: () => http.get<{ number: number; docNo: string; seriesType: string }>(`/document-series/${seriesId}/preview`, { date }), enabled: !!seriesId });
