import type { OrderStatus } from '../api/types';

/**
 * Pure function mapping a table's order status + kot_sent flag to the
 * status color used on the Table Floor View card.
 *
 * Locked mapping (from validated screenshot evidence):
 *  - null/open  -> grey    (blank / not occupied)
 *  - running, kotSent=false -> blue
 *  - running, kotSent=true  -> yellow (running + KOT sent)
 *  - printed    -> green
 *  - paid       -> orange
 *  - cancelled  -> muted red ("mutedRed") — not called out in the locked
 *    screenshots (cancelled orders don't normally hold a table open), but a
 *    muted/desaturated red is the conventional POS choice to flag a
 *    cancelled table distinctly from the "paid" orange and the "open" grey
 *    without implying an active/positive state.
 */
export function getTableStatusColor(status: OrderStatus | null, kotSent: boolean): string {
  if (status === null || status === 'open') {
    return 'grey';
  }
  if (status === 'running') {
    return kotSent ? 'yellow' : 'blue';
  }
  if (status === 'printed') {
    return 'green';
  }
  if (status === 'paid') {
    return 'orange';
  }
  if (status === 'cancelled') {
    return 'mutedRed';
  }
  // Exhaustiveness guard — should be unreachable given OrderStatus.
  return 'grey';
}
