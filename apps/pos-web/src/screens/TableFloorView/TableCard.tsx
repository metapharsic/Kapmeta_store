import React from 'react';
import type { RestaurantTable } from '../../api/types';
import { getTableStatusColor } from '../../lib/getTableStatusColor';

const STATUS_COLOR_HEX: Record<string, string> = {
  grey: '#9aa4b2',
  blue: '#2f6fed',
  green: '#2fa84f',
  orange: '#e08a1e',
  yellow: '#e0c61e',
  mutedRed: '#b5504a',
};

function elapsedMinutes(runningSince: string | null): number | null {
  if (!runningSince) return null;
  const ms = Date.now() - new Date(runningSince).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

export interface TableCardProps {
  table: RestaurantTable;
  selected?: boolean;
  onSelect: (table: RestaurantTable) => void;
}

export const TableCard: React.FC<TableCardProps> = ({ table, selected, onSelect }) => {
  const colorKey = getTableStatusColor(table.status, table.kotSent);
  const colorHex = STATUS_COLOR_HEX[colorKey] ?? STATUS_COLOR_HEX.grey;
  const showRunningInfo = table.status !== null && table.status !== 'open';
  const mins = elapsedMinutes(table.runningSince);

  return (
    <button
      type="button"
      onClick={() => onSelect(table)}
      data-testid={`table-card-${table.id}`}
      data-status-color={colorKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        width: 120,
        height: 88,
        padding: 10,
        borderRadius: 8,
        border: selected ? '2px solid #164f9c' : '1px solid #dfe4ea',
        background: colorHex,
        color: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15 }}>{table.name}</span>
      {showRunningInfo && (
        <span style={{ fontSize: 12, lineHeight: 1.4 }}>
          {mins !== null && <>{mins} min</>}
          {mins !== null && table.runningAmount !== null && <br />}
          {table.runningAmount !== null && <>₹{table.runningAmount.toFixed(2)}</>}
        </span>
      )}
    </button>
  );
};

export default TableCard;
