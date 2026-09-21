import { useQuery } from '@tanstack/react-query';
import { http } from './client';
import { useAll } from './hooks';

export const useCurrencies = () => useAll<{ id: string; code: string; name: string; symbol: string }>('currencies');
export const useUnits = () => useAll<{ id: string; code: string; name: string }>('units');
export const useTaxRates = () => useAll<{ id: string; name: string; rate: string; type: string }>('tax-rates');
export const useCategories = () => useAll<{ id: string; name: string }>('categories');
export const usePaymentTerms = () => useAll<{ id: string; name: string; days: number; isDefault: boolean }>('payment-terms');
export const useSalesPersons = () => useAll<{ id: string; name: string }>('sales-persons');
export const useLocations = (kind: string, parentId?: string | null) =>
  useAll<{ id: string; name: string; kind: string; parentId: string | null }>('locations', { filters: JSON.stringify([{ field: 'kind', op: 'eq', value: kind }, ...(parentId ? [{ field: 'parentId', op: 'eq', value: parentId }] : [])]) });

export interface Account { id: string; name: string; type: string; subType: string; nature: string; parentId: string | null; firmId: string | null; currencyId: string; isGroup: boolean; isSystem: boolean; systemKey: string | null; balance: number; isActive: boolean; notes: string | null }
export const useAccounts = (params: Record<string, unknown> = {}) => useQuery({ queryKey: ['accounts', params], queryFn: () => http.get<Account[]>('/accounts', params) });

export interface ContactOption { id: string; label: string; serialNo: number; displayName: string; discountType: string; discountValue: string }
export const useContactSearch = (type: 'customer' | 'vendor' | 'broker' | 'all', term = '') =>
  useQuery({ queryKey: ['contacts', 'search', type, term], queryFn: () => http.get<ContactOption[]>('/contacts/search', { type, term }) });
