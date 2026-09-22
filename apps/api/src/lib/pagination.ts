import type { PaginationMeta } from '@diamond/shared'

export interface PageRequest {
  page: number
  pageSize: number
}

export function toOffset({ page, pageSize }: PageRequest): number {
  return (page - 1) * pageSize
}

export function buildPaginationMeta(total: number, { page, pageSize }: PageRequest): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1 && total > 0,
  }
}
