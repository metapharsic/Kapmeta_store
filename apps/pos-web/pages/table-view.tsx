import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import KapMetaHeader from "../components/KapMetaHeader";
import TableViewFloor from "../components/TableViewFloor";
import { useAuthGuard } from "../lib/auth";

export default function TableViewPage() {
  const router = useRouter();
  const { me } = useAuthGuard("order.create");

  // All outlet identity data comes from the authenticated session — no hardcoded literals.
  const outletName = me?.outlet?.name ?? "";
  const outletCode = (me?.outlet as any)?.code ?? "";

  const handleSelectTable = (table: any) => {
    router.push(`/?table=${encodeURIComponent(table.tableNumber)}&tableId=${table.id}`);
  };

  const handleNavigateDelivery = () => {
    router.push("/?mode=DELIVERY");
  };

  const handleNavigatePickup = () => {
    router.push("/?mode=PICKUP");
  };

  return (
    <div className="kapmeta-app-root">
      <Head>
        <title>{outletName ? `${outletName} - Table View` : "KapMeta POS - Table View"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta
          name="description"
          content="KapMeta POS Dining Table View and Floor Management Floor Plan"
        />
      </Head>

      {/* Universal Top KapMeta Titlebar & Header */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => router.push("/?mode=DINE_IN")}
      />

      {/* Main Table View Floor Plan */}
      <TableViewFloor
        onSelectTable={handleSelectTable}
        onNavigateDelivery={handleNavigateDelivery}
        onNavigatePickup={handleNavigatePickup}
      />

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg-card);
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
