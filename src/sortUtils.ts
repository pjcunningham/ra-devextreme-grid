import type { SortPayload } from 'react-admin';
import type { SortOrder as DxSortOrder } from 'devextreme/common';

export function toDxSortOrder(order: SortPayload['order']): DxSortOrder {
  return order.toLowerCase() as DxSortOrder;
}

export function toRaSortOrder(order: DxSortOrder): SortPayload['order'] {
  return order.toUpperCase() as SortPayload['order'];
}
