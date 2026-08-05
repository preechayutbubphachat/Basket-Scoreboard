import type { Key, ReactNode } from "react";
import { UiEmptyState } from "./UiEmptyState";

export type UiDataTableColumn<Row> = {
  align?: "start" | "center" | "end";
  header: ReactNode;
  key: string;
  render: (row: Row, rowIndex: number) => ReactNode;
  rowHeader?: boolean;
};

export type UiDataTableProps<Row> = {
  caption: ReactNode;
  className?: string;
  columns: readonly UiDataTableColumn<Row>[];
  emptyState?: ReactNode;
  getRowKey?: (row: Row, rowIndex: number) => Key;
  loading?: boolean;
  loadingState?: ReactNode;
  rows: readonly Row[];
};

export function UiDataTable<Row>({
  caption,
  className,
  columns,
  emptyState,
  getRowKey,
  loading = false,
  loadingState,
  rows
}: UiDataTableProps<Row>) {
  const fallbackLoadingState = (
    <UiEmptyState description="The current view is waiting for consumer-supplied data." state="loading" title="Loading data" />
  );
  const fallbackEmptyState = (
    <UiEmptyState description="No rows are available in the current view." state="empty" title="No data" />
  );

  return (
    <div
      aria-busy={loading}
      className={["ui-data-table-region", className].filter(Boolean).join(" ")}
      tabIndex={0}
    >
      <table className="ui-data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={`ui-data-table__cell ui-data-table__cell--${column.align ?? "start"}`} key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || rows.length === 0 ? (
            <tr>
              <td className="ui-data-table__state" colSpan={Math.max(columns.length, 1)}>
                {loading ? (loadingState ?? fallbackLoadingState) : (emptyState ?? fallbackEmptyState)}
              </td>
            </tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}>
              {columns.map((column) => {
                const Cell = column.rowHeader ? "th" : "td";
                return (
                  <Cell
                    className={`ui-data-table__cell ui-data-table__cell--${column.align ?? "start"}`}
                    key={column.key}
                    {...(column.rowHeader ? { scope: "row" } : {})}
                  >
                    {column.render(row, rowIndex)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
