import { forwardRef, type ForwardedRef } from 'react';
import { Pagination, type PaginationRef } from 'devextreme-react/pagination';
import { useListContext } from 'react-admin';
import type { DatagridDXPaginationProps } from './types';

export const DEFAULT_ALLOWED_PAGE_SIZES = [5, 10, 25, 50];

const DEFAULT_PAGINATION_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--dx-component-color-bg, #fff)',
  color: 'var(--dx-color-text, #333)',
  paddingLeft: 10,
  paddingRight: 10,
};

/**
 * A React-Admin aware standalone pagination component powered by DevExtreme's Pagination widget.
 *
 * Wire it via `<List pagination={<DatagridDXPagination />}>`.
 *
 * Automatically connects to React-Admin's `ListContext` for:
 * - `page` -> `pageIndex` (1-based)
 * - `perPage` -> `pageSize`
 * - `total` -> `itemCount`
 * - `onPageIndexChange` -> `setPage`
 * - `onPageSizeChange` -> `setPerPage`
 *
 * If `total` is undefined or null (e.g. data provider does not support total counts),
 * this component renders `null` to avoid displaying misleading page counts.
 */
export const DatagridDXPagination = forwardRef(
  (props: DatagridDXPaginationProps, ref: ForwardedRef<PaginationRef>) => {
    const { page, perPage, total, setPage, setPerPage } = useListContext();

    if (total === undefined || total === null) {
      return null;
    }

    const {
      showInfo = true,
      showNavigationButtons = true,
      showPageSizeSelector = true,
      allowedPageSizes = DEFAULT_ALLOWED_PAGE_SIZES,
      style,
      ...restProps
    } = props;

    const mergedStyle: React.CSSProperties = {
      ...DEFAULT_PAGINATION_STYLE,
      ...style,
    };

    return (
      <Pagination
        {...restProps}
        ref={ref}
        style={mergedStyle}
        pageIndex={page}
        pageSize={perPage}
        itemCount={total}
        showInfo={showInfo}
        showNavigationButtons={showNavigationButtons}
        showPageSizeSelector={showPageSizeSelector}
        allowedPageSizes={allowedPageSizes}
        onPageIndexChange={(newIndex: number) => {
          setPage(newIndex);
        }}
        onPageSizeChange={(newSize: number) => {
          setPerPage(newSize);
        }}
      />
    );
  }
);

DatagridDXPagination.displayName = 'DatagridDXPagination';
