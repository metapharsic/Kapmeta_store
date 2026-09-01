import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuthGuard } from "../lib/auth";
import KapMetaHeader from "../components/KapMetaHeader";
import TableViewFloor from "../components/TableViewFloor";
import PosBillingView from "../components/PosBillingView";

export default function POSIndexPage() {
  const { me, loading: authLoading } = useAuthGuard("order.create");
  const router = useRouter();

  const outlet = me?.outlet ?? null;
  const outletName = outlet?.name || (authLoading ? "Loading..." : "Hotel Kapila");
  const outletCode = outlet?.taxNumber ? `R${outlet.taxNumber.slice(0, 6)}` : "R327038";

  // Check router query to see if we should display billing or floor
  const [viewMode, setViewMode] = useState<"FLOOR" | "BILLING">("FLOOR");
  const [selectedTable, setSelectedTable] = useState<string>("A1");
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [selectedOrderMode, setSelectedOrderMode] = useState<"DINE_IN" | "DELIVERY" | "PICKUP">("DINE_IN");

  useEffect(() => {
    if (router.query.table) {
      setSelectedTable(String(router.query.table));
      if (router.query.tableId) setSelectedTableId(String(router.query.tableId));
      setViewMode("BILLING");
    } else if (router.query.mode) {
      const mode = String(router.query.mode).toUpperCase();
      if (mode === "DELIVERY" || mode === "PICKUP" || mode === "DINE_IN") {
        setSelectedOrderMode(mode as any);
      }
      setViewMode("BILLING");
    }
  }, [router.query]);

  const handleNewOrder = () => {
    setSelectedTable("Direct");
    setSelectedTableId("");
    setViewMode("BILLING");
  };

  const handleSelectTableFromFloor = (table: any) => {
    setSelectedTable(table.tableNumber);
    setSelectedTableId(table.id);
    setViewMode("BILLING");
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏳</div>
          <div>Loading kapMeta POS Register...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="kapmeta-app-root">
      <Head>
        <title>{outletName} - KapMeta POS Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Universal Top Header */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={handleNewOrder}
      />

      {/* Main View Area */}
      {viewMode === "FLOOR" ? (
        <TableViewFloor
          onSelectTable={handleSelectTableFromFloor}
          onNavigateDelivery={() => {
            setSelectedOrderMode("DELIVERY");
            setViewMode("BILLING");
          }}
          onNavigatePickup={() => {
            setSelectedOrderMode("PICKUP");
            setViewMode("BILLING");
          }}
        />
      ) : (
        <PosBillingView
          initialTable={selectedTable}
          initialTableId={selectedTableId}
          initialMode={selectedOrderMode}
          onBackToTables={() => {
            setViewMode("FLOOR");
            router.push("/", undefined, { shallow: true });
          }}
        />
      )}

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f8fafc;
          overflow-x: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
