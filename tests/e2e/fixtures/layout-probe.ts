import DataGrid from 'devextreme/ui/data_grid';
import 'devextreme/dist/css/dx.light.css';

const events: string[] = [];
const grid = new DataGrid(document.getElementById('grid')!, {
  dataSource: [{ id: 1, company: 'A long company name', city: 'London', country: 'UK' }],
  keyExpr: 'id',
  columnAutoWidth: true,
  columnHidingEnabled: true,
  allowColumnResizing: true,
  allowColumnReordering: true,
  columnChooser: { enabled: true, mode: 'select' },
  columnFixing: { enabled: true },
  columns: [
    { dataField: 'id', width: 70 },
    { dataField: 'company', minWidth: 200 },
    { dataField: 'city', minWidth: 150, hidingPriority: 0 },
    { dataField: 'country', minWidth: 150, hidingPriority: 1 },
  ],
  onOptionChanged: (event) => events.push(event.fullName),
});

Object.assign(window, {
  layoutProbe: () => ({
    events: [...events],
    columns: Array.from({ length: grid.columnCount() }, (_, index) => {
      const column = grid.columnOption(index);
      return { key: column.dataField, visible: column.visible, width: column.width };
    }),
  }),
});
