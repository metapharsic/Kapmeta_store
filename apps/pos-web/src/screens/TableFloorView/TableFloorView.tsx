import React from 'react';
import type { KapmetaApiClient } from '../../api/ApiClient';
import type { RestaurantTable } from '../../api/types';
import { TableCard } from './TableCard';

export interface TableFloorViewProps {
  apiClient: KapmetaApiClient;
  onAddTable: () => void;
  onDelivery: () => void;
  onPickUp: () => void;
  onTableSelected: (table: RestaurantTable) => void;
}

interface ZoneGroup {
  zone: string;
  tables: RestaurantTable[];
}

function groupByZone(tables: RestaurantTable[]): ZoneGroup[] {
  const map = new Map<string, RestaurantTable[]>();
  for (const table of tables) {
    const list = map.get(table.zone) ?? [];
    list.push(table);
    map.set(table.zone, list);
  }
  return Array.from(map.entries()).map(([zone, zoneTables]) => ({ zone, tables: zoneTables }));
}

/**
 * Table / Floor View screen: fetches tables from the injected ApiClient,
 * groups them by zone, and renders a TableCard per table with the correct
 * status color. Top-right actions (Add Table / Delivery / Pick Up) and the
 * Move KOT / Items mode toggle are wired to handler props / local state.
 */
export const TableFloorView: React.FC<TableFloorViewProps> = ({
  apiClient,
  onAddTable,
  onDelivery,
  onPickUp,
  onTableSelected,
}) => {
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [moveKotMode, setMoveKotMode] = React.useState(false);
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);

  const loadTables = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.listTables();
      setTables(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  React.useEffect(() => {
    loadTables();
  }, [loadTables]);

  const handleSelect = (table: RestaurantTable) => {
    if (moveKotMode) {
      setSelectedTableId((prev) => (prev === table.id ? null : table.id));
      return;
    }
    onTableSelected(table);
  };

  const zones = React.useMemo(() => groupByZone(tables), [tables]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>Table View</h2>

        <button
          type="button"
          onClick={() => setMoveKotMode((v) => !v)}
          data-testid="move-kot-toggle"
          aria-pressed={moveKotMode}
          style={{ padding: '8px 12px' }}
        >
          {moveKotMode ? 'Move KOT / Items: ON' : 'Move KOT / Items'}
        </button>

        <button type="button" onClick={onAddTable} data-testid="add-table-button">
          Add Table
        </button>
        <button type="button" onClick={onDelivery} data-testid="delivery-button">
          Delivery
        </button>
        <button type="button" onClick={onPickUp} data-testid="pickup-button">
          Pick Up
        </button>
      </div>

      {loading && <p>Loading tables…</p>}
      {error && <p role="alert">Error: {error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
          {zones.map((group) => (
            <section key={group.zone}>
              <h3 style={{ marginBottom: 8 }}>{group.zone}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {group.tables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    selected={selectedTableId === table.id}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </section>
          ))}
          {zones.length === 0 && <p>No tables configured yet.</p>}
        </div>
      )}
    </div>
  );
};

export default TableFloorView;
