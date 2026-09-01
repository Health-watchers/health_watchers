package com.healthwatchers.sdk.model;

/**
 * Union of the pagination metadata shapes returned by the API's list endpoints. Different
 * modules format this slightly differently, so fields not used by a given endpoint are left
 * {@code null} rather than modeling a separate class per endpoint:
 *
 * <ul>
 *   <li>{@code GET /patients} (see {@code apps/api/src/utils/paginate.ts}): {@code total, page,
 *       limit, totalPages, hasNextPage, hasPrevPage, nextCursor}.</li>
 *   <li>{@code GET /appointments} (see {@code appointments.controller.ts}): {@code page, limit,
 *       total, pages, totalPages, hasNext, hasPrev}.</li>
 * </ul>
 */
public class PaginationMeta {
  public Integer total;
  public Integer page;
  public Integer limit;
  public Integer totalPages;

  /** Alias for {@link #totalPages} used by the appointments list endpoint. */
  public Integer pages;

  public Boolean hasNextPage;
  public Boolean hasPrevPage;

  /** Alias for {@link #hasNextPage} used by the appointments list endpoint. */
  public Boolean hasNext;

  /** Alias for {@link #hasPrevPage} used by the appointments list endpoint. */
  public Boolean hasPrev;

  /** Opaque cursor for the next page; only populated by cursor-aware endpoints. */
  public String nextCursor;

  @Override
  public String toString() {
    return "PaginationMeta{total=" + total + ", page=" + page + ", limit=" + limit
        + ", totalPages=" + (totalPages != null ? totalPages : pages) + "}";
  }
}
