import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import LiveOrdersView from "./LiveOrdersView";
import AllOrdersView, { AllOrdersMode, OrdersTableRow } from "./AllOrdersView";
import AggregatorOrdersView from "./AggregatorOrdersView";

export type OrderCategory = "ALL" | "DINE_IN" | "DELIVERY" | "PICK_UP";
export type OrderBillStatus = "SAVED_BILL" | "PRINTED_BILL" | "CANCELLED_BILL" | "PAID";

/**
 * Legacy row shape kept for callers that still pass pre-mapped rows in
 * (`initialOrders`). The four screens below fetch their own data; these rows
 * are used only to seed the All Orders table before its first response lands.
 */
export interface KapMetaOrderRowData {
  id: string;
  orderNo: string;
  aggregatorTag?: string | null;
  orderTypeTitle: string;
  orderTypeSubtitle?: string;
  customerPhone?: string | null;
  customerName?: string | null;
  paymentType: string;
  myAmount: number;
  tax: number;
  discount: number;
  grandTotal: number;
  created: string;
  status: OrderBillStatus;
}

export interface KapMetaOrdersViewProps {
  initialOrders?: KapMetaOrderRowData[];
  onBackToPos?: () => void;
  onViewOrderDetails?: (orderId: string) => void;
  onPrintBill?: (orderId: string) => void;
}

/**
 * Intentionally empty. Live rows are provisioned from PostgreSQL via the
 * orders API; the project rules forbid inlining sample business data.
 */
export const REFERENCE_CURRENT_ORDERS: KapMetaOrderRowData[] = [];

type TopTab = "LIVE" | "ALL" | "ONLINE" | "ADVANCE";

const TAB_QUERY: Record<TopTab, string> = {
  LIVE: "live",
  ALL: "all",
  ONLINE: "online",
  ADVANCE: "advance",
};

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L10.5 22 19.5 10.5H13Z" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function IconScooter() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="18" r="2.6" />
      <path d="M6 15.4V11h5l3 4.5" />
      <path d="M11 11 9.6 6.5H7.2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

/** Legacy pre-mapped row -> the shape the All Orders table renders. */
function seedFromLegacyRow(r: KapMetaOrderRowData): OrdersTableRow {
  return {
    id: r.id,
    orderNo: r.orderNo,
    orderTypeRaw: r.orderTypeTitle,
    tableNumber: null,
    isAirConditioned: null,
    customerName: r.customerName ?? null,
    assignTo: null,
    itemCount: 0,
    myAmountMinorNum: Math.round(r.myAmount * 100),
    taxMinorNum: Math.round(r.tax * 100),
    discountMinorNum: Math.round(r.discount * 100),
    grandTotalMinorNum: Math.round(r.grandTotal * 100),
    roundOffMinorNum: null,
    paymentMethod: r.paymentType || null,
    status: r.status,
    createdAt: r.created,
    channel: r.aggregatorTag ?? null,
    isAdvance: false,
    isSplit: false,
    isSettled: r.status === "PAID",
    isUpdatedAfterSave: false,
  };
}

export default function KapMetaOrdersView({
  initialOrders = [],
  onBackToPos,
  onViewOrderDetails,
  onPrintBill,
}: KapMetaOrdersViewProps) {
  const router = useRouter();
  const [topTab, setTopTab] = useState<TopTab>("LIVE");

  useEffect(() => {
    const raw = router.query.tab;
    if (!raw) return;
    const t = String(raw).toLowerCase();
    if (t === "live" || t === "current") setTopTab("LIVE");
    else if (t === "all") setTopTab("ALL");
    else if (t === "online") setTopTab("ONLINE");
    else if (t === "advance") setTopTab("ADVANCE");
  }, [router.query.tab]);

  const goToTab = (tab: TopTab) => {
    setTopTab(tab);
    router.push(`/orders?tab=${TAB_QUERY[tab]}`, undefined, { shallow: true });
  };

  const handleBack = () => {
    if (onBackToPos) onBackToPos();
    else router.push("/");
  };

  const handleViewOrder = (orderId: string) => {
    if (onViewOrderDetails) onViewOrderDetails(orderId);
    else router.push(`/pending-order-detail?orderId=${orderId}`);
  };

  // `onPrintBill` stays part of the public props; the per-row printer control
  // in the table routes through it when a host page supplies one.
  const handlePrintOrView = (orderId: string) => {
    if (onPrintBill) onPrintBill(orderId);
    else handleViewOrder(orderId);
  };

  const seedRows = useMemo(() => initialOrders.map(seedFromLegacyRow), [initialOrders]);

  const tabs: { key: TopTab; label: string; icon: React.ReactNode }[] = [
    { key: "LIVE", label: "Live Orders", icon: <IconBolt /> },
    { key: "ALL", label: "All Orders", icon: <IconList /> },
    { key: "ONLINE", label: "Online Orders", icon: <IconScooter /> },
    { key: "ADVANCE", label: "Advance Order", icon: <IconCalendar /> },
  ];

  const allOrdersMode: AllOrdersMode = topTab === "ADVANCE" ? "ADVANCE" : "ORDER";

  return (
    <div className="orders-shell">
      <nav className="orders-topnav" aria-label="Order registers">
        <div className="topnav-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={topTab === t.key}
              className={`topnav-tab ${topTab === t.key ? "is-active" : ""}`}
              onClick={() => goToTab(t.key)}
            >
              <span className="topnav-icon" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <button type="button" className="btn-back" onClick={handleBack} title="Return to POS floor">
          <IconBack />
          <span>Back</span>
        </button>
      </nav>

      {topTab === "LIVE" && <LiveOrdersView onOpenOrder={handleViewOrder} />}

      {(topTab === "ALL" || topTab === "ADVANCE") && (
        <AllOrdersView
          mode={allOrdersMode}
          onModeChange={(m) => goToTab(m === "ADVANCE" ? "ADVANCE" : "ALL")}
          onViewOrder={handlePrintOrView}
          seedRows={seedRows}
        />
      )}

      {topTab === "ONLINE" && <AggregatorOrdersView onViewOrder={handleViewOrder} />}

      <style jsx>{`
        .orders-shell {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 42px);
          width: 100%;
          background: var(--bg-base);
          overflow: hidden;
        }

        .orders-topnav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 16px;
          height: 48px;
          flex-shrink: 0;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
        }

        .topnav-tabs {
          display: flex;
          align-items: stretch;
          gap: 4px;
          height: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .topnav-tabs::-webkit-scrollbar {
          display: none;
        }

        .topnav-tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 100%;
          padding: 0 14px;
          border: none;
          border-bottom: 3px solid transparent;
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        }
        .topnav-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .topnav-tab.is-active {
          color: var(--text-primary);
          border-bottom-color: var(--accent);
          font-weight: 700;
        }
        .topnav-icon {
          display: inline-flex;
          color: var(--text-muted);
        }
        .topnav-tab.is-active .topnav-icon {
          color: var(--accent-subtle-text);
        }

        .btn-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 36px;
          padding: 0 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: background-color 0.15s ease;
        }
        .btn-back:hover {
          background: var(--bg-subtle);
        }

        .topnav-tab:focus-visible,
        .btn-back:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .topnav-tab,
          .btn-back {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
