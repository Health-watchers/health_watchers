package com.healthwatchers.sdk.model;

import java.util.List;

/** A list response envelope: {@code { status, data: [...], pagination: {...} } }. */
public class PagedResult<T> {
  private final List<T> data;
  private final PaginationMeta pagination;

  public PagedResult(List<T> data, PaginationMeta pagination) {
    this.data = data;
    this.pagination = pagination;
  }

  public List<T> getData() {
    return data;
  }

  public PaginationMeta getPagination() {
    return pagination;
  }
}
