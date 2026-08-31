import React, { useState, useEffect } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import { useKapmetaSocket } from "../lib/useKapmetaSocket";
import PetPoojaHeader from "../components/PetPoojaHeader";
import PetPoojaKotView, { REFERENCE_KOT_TICKETS, KotCardData } from "../components/PetPoojaKotView";

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
  const { me, loading: authLoading } = useAuthGuard("kot.read");
  const [tickets, setTickets] = useState<KOTTicket[]>([]);
  const [now, setNow] = useState(Date.now());

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
    if (authLoading) return;
    fetchTickets();
  }, [authLoading]);

  // Long-lived socket + backup poller + clock tick
  useKapmetaSocket(
    () => {
      fetchTickets();
    },
    !authLoading,
    "kitchen"
  );

  useEffect(() => {
    if (authLoading) return;

    const interval = setInterval(fetchTickets, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [authLoading]);

  const handleUpdateStatus = async (ticketId: string, currentStatus: string) => {
    try {
      await authedFetch(`/kitchen/kot/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: "READY" }),
      });
      fetchTickets();
    } catch {}
  };

  const liveDbTickets: KotCardData[] = tickets.map((t, idx) => ({
    id: t.id,
    kotNo: t.ticketNumber || String(idx + 1),
    orderType: (t.orderType as any) || "PICK_UP",
    orderTypeDisplay:
      t.orderType === "DINE_IN"
        ? "Dine In"
        : t.orderType === "DELIVERY"
        ? "Delivery"
        : "Pick Up",
    orderTag: t.tableNumber ? `b${t.tableNumber}` : undefined,
    initialElapsedSeconds: Math.max(
      0,
      Math.floor((now - new Date(t.createdAt).getTime()) / 1000)
    ),
    biller: "biller (biller)",
    items: t.kotItems.map((it) => ({
      id: it.id,
      name: it.menuItem.name,
      quantity: it.quantity,
      notes: it.notes,
    })),
    status: t.status,
    createdAt: t.createdAt,
  }));

  const mappedTickets: KotCardData[] =
    liveDbTickets.length > 0
      ? [...liveDbTickets, ...REFERENCE_KOT_TICKETS.filter((r) => !liveDbTickets.some((l) => l.kotNo === r.kotNo))]
      : REFERENCE_KOT_TICKETS;

  return (
    <div className="petpooja-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta
          name="description"
          content="KapMeta POS Operations kitchen display system for food preparation tracking."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Universal PetPooja Top Header & Window Titlebar */}
      <PetPoojaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => {
          window.location.href = "/";
        }}
      />

      {/* Main PetPooja POS KOT View */}
      <PetPoojaKotView
        initialTickets={mappedTickets}
        onMarkFoodReady={(id) => {
          handleUpdateStatus(id, "PREPARING");
        }}
        onBackToPos={() => {
          window.location.href = "/";
        }}
      />

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f1f5f9;
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
