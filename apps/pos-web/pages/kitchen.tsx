import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { authedFetch, useAuthGuard } from "../lib/auth";
import { useKapmetaSocket } from "../lib/useKapmetaSocket";
import KapMetaHeader from "../components/KapMetaHeader";
import KapMetaKotView, { KotCardData } from "../components/KapMetaKotView";
import KotHistoryView from "../components/KotHistoryView";

interface KOTItem {
  id: string;
  quantity: number;
  notes: string | null;
  course: string | null;
  servedAt: string | null;
  menuItem: {
    name: string;
  };
}

interface KOTTicket {
  id: string;
  orderId: string;
  ticketNumber: string;
  stationId: string | null;
  stationName: string | null;
  status: "QUEUED" | "PREPARING" | "READY" | "SERVED";
  createdAt: string;
  servedAt: string | null;
  kotItems: KOTItem[];
  orderType: string;
  tableNumber: string | null;
  slaWarningSeconds: number;
  slaBreachSeconds: number;
}

export default function KitchenMonitor() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuthGuard("kot.read");
  const [tickets, setTickets] = useState<KOTTicket[]>([]);
  const [now, setNow] = useState(Date.now());

  // /kitchen           -> live KDS card board (real-time work surface)
  // /kitchen?view=list -> historical KOT report table (KotHistoryView)
  // The two are different products on the same data, so they get one route and
  // a query param rather than one component doing both: the history screen is
  // then deep-linkable/bookmarkable and Back moves between the two views.
  const isHistoryView = router.query.view === "list";

  const outletName = me?.outlet?.name || "Hotel kapila";
  const outletCode = me?.outlet?.taxNumber ? `R${me.outlet.taxNumber.slice(0, 6)}` : "R327038";

  const fetchTickets = () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    authedFetch("/kitchen/kot", { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((data: KOTTicket[]) => {
        const incoming = Array.isArray(data) ? data : [];
        setTickets(incoming);
      })
      .catch(() => {
        clearTimeout(timeout);
      });
  };

  useEffect(() => {
    if (authLoading || isHistoryView) return;
    fetchTickets();
  }, [authLoading, isHistoryView]);

  // Long-lived socket + backup poller + clock tick
  useKapmetaSocket(
    () => {
      fetchTickets();
    },
    !authLoading && !isHistoryView,
    "kitchen"
  );

  useEffect(() => {
    if (authLoading || isHistoryView) return;

    const interval = setInterval(fetchTickets, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [authLoading, isHistoryView]);

  // KOT_TRANSITIONS (packages/shared-types/kitchen.ts) only allows
  // QUEUED -> PREPARING -> READY -> SERVED in sequence; jumping straight
  // from QUEUED to READY is an illegal transition the API rejects with 409.
  // Advance by exactly one step from the ticket's actual current status
  // instead of hardcoding "READY", and surface a failure by re-syncing
  // from the server instead of silently swallowing it.
  const NEXT_KOT_STATUS: Record<string, string> = {
    QUEUED: "PREPARING",
    PREPARING: "READY",
    READY: "SERVED",
  };

  const handleUpdateStatus = async (ticketId: string, currentStatus: string) => {
    const toStatus = NEXT_KOT_STATUS[currentStatus];
    if (!toStatus) {
      fetchTickets();
      return;
    }
    try {
      const res = await authedFetch(`/kitchen/kot/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      if (!res.ok) throw new Error("HTTP error " + res.status);
    } catch {
      // Fall through to fetchTickets() below so the board re-syncs with the
      // server's actual state instead of staying on the optimistic update.
    }
    fetchTickets();
  };

  const liveDbTickets: KotCardData[] = tickets.map((t, idx) => ({
    id: t.id,
    kotNo: t.ticketNumber || String(idx + 1),
    orderType: (t.orderType as any) || "PICK_UP",
    orderTypeDisplay:
      t.orderType === "DINE_IN"
        ? "🍽️ Dine In"
        : t.orderType === "DELIVERY"
        ? "🛵 Delivery"
        : "🛍️ Pick Up",
    orderTag: t.tableNumber ? `b${t.tableNumber}` : undefined,
    initialElapsedSeconds: Math.max(
      0,
      Math.floor((now - new Date(t.createdAt).getTime()) / 1000)
    ),
    biller: t.stationName ? `${t.stationName} Station` : "Kitchen Station",
    items: t.kotItems.map((it) => ({
      id: it.id,
      name: it.menuItem.name,
      quantity: it.quantity,
      notes: it.notes,
    })),
    status: t.status,
    createdAt: t.createdAt,
  }));

  const mappedTickets: KotCardData[] = liveDbTickets;

  return (
    <div className="kapmeta-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta
          name="description"
          content="KapMeta POS Operations kitchen display system for food preparation tracking."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Universal KapMeta Top Header & Window Titlebar */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => {
          window.location.href = "/";
        }}
      />

      {/* Main body: live KDS board, or the historical KOT report table */}
      {isHistoryView ? (
        <KotHistoryView onBackToBoard={() => router.push("/kitchen")} />
      ) : (
        <KapMetaKotView
          initialTickets={mappedTickets}
          onMarkFoodReady={(id) => {
            const ticket = tickets.find((t) => t.id === id);
            handleUpdateStatus(id, ticket?.status || "QUEUED");
          }}
          onBackToPos={() => {
            window.location.href = "/";
          }}
          onOpenKotList={() => router.push("/kitchen?view=list")}
        />
      )}

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg-subtle);
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
