import { expect, it, vi } from 'vitest';
import { dataProvider } from '../examples/remote-fastapi/frontend/src/dataProvider';
import type { GetGridParams } from '../src';

it('normalizes DATE operands in both native scope and original group-paging user filter', async () => {
  const date = new Date(2024, 0, 15);
  const filter = ['joined_on', '>=', date];
  const group = [{ selector: 'country', desc: false, isExpanded: false }];
  const params: GetGridParams = {
    loadOptions: {
      take: 2,
      filter: [['country', '=', 'UK'], 'and', filter],
      groupPagingContext: { group, filter },
    },
  };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 1 }] }) });
  vi.stubGlobal('fetch', fetch);
  try {
    expect(await dataProvider.getGrid('group-paged-remote-customers', params)).toEqual({
      data: [{ id: 1 }],
    });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      loadOptions: {
        take: 2,
        filter: [['country', '=', 'UK'], 'and', ['joined_on', '>=', '2024-01-15']],
        groupPagingContext: { group, filter: ['joined_on', '>=', '2024-01-15'] },
      },
    });
    expect(filter[2]).toBe(date);
    expect(params.loadOptions.groupPagingContext!.filter).toBe(filter);
  } finally {
    vi.unstubAllGlobals();
  }
});
