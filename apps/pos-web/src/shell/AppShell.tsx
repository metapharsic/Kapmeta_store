import React from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: React.ReactNode;
  onNewOrder: () => void;
  onSearchBillNo: (billNo: string) => void;
  onSearchKotNo: (kotNo: string) => void;
  onItemOnOff: () => void;
  onStore: () => void;
  onLiveView: () => void;
  onOrders: () => void;
  onRecent: () => void;
  onHold: () => void;
  onAlerts: () => void;
  onZomatoHelp: () => void;
  onLogout: () => void;
  /** Support phone number displayed on the right of the top bar. */
  supportPhoneNumber: string;
}

/**
 * Persistent app-shell top bar. Every screen in the POS mounts inside this
 * component's content area so the bar (New Order CTA, search boxes, nav
 * actions, logout, support number) stays present across navigation.
 */
export const AppShell: React.FC<AppShellProps> = ({
  children,
  onNewOrder,
  onSearchBillNo,
  onSearchKotNo,
  onItemOnOff,
  onStore,
  onLiveView,
  onOrders,
  onRecent,
  onHold,
  onAlerts,
  onZomatoHelp,
  onLogout,
  supportPhoneNumber,
}) => {
  const [billNo, setBillNo] = React.useState('');
  const [kotNo, setKotNo] = React.useState('');

  return (
    <div className={styles.shell}>
      <header className={styles.topBar} role="banner">
        <button
          type="button"
          className={styles.newOrderButton}
          onClick={onNewOrder}
          data-testid="new-order-button"
        >
          + New Order
        </button>

        <input
          className={styles.searchInput}
          type="text"
          placeholder="Bill No"
          aria-label="Search Bill No"
          value={billNo}
          onChange={(e) => setBillNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchBillNo(billNo);
          }}
        />

        <input
          className={styles.searchInput}
          type="text"
          placeholder="KOT No"
          aria-label="Search KOT No"
          value={kotNo}
          onChange={(e) => setKotNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchKotNo(kotNo);
          }}
        />

        <button type="button" className={styles.navButton} onClick={onItemOnOff}>
          Item On/Off
        </button>
        <button type="button" className={styles.navButton} onClick={onStore}>
          Store
        </button>
        <button type="button" className={styles.navButton} onClick={onLiveView}>
          Live View
        </button>
        <button type="button" className={styles.navButton} onClick={onOrders}>
          Orders
        </button>
        <button type="button" className={styles.navButton} onClick={onRecent}>
          Recent
        </button>
        <button type="button" className={styles.navButton} onClick={onHold}>
          Hold
        </button>
        <button type="button" className={styles.navButton} onClick={onAlerts}>
          Alerts
        </button>
        <button type="button" className={styles.navButton} onClick={onZomatoHelp}>
          Zomato Help
        </button>

        <div className={styles.spacer} />

        <span className={styles.supportPhone}>{supportPhoneNumber}</span>

        <button type="button" className={styles.logoutButton} onClick={onLogout}>
          Logout
        </button>
      </header>

      <main className={styles.content}>{children}</main>
    </div>
  );
};

export default AppShell;
