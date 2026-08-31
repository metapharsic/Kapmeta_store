import React, { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import PetPoojaHeader from "../components/PetPoojaHeader";
import TableViewFloor from "../components/TableViewFloor";

export default function TableViewPage() {
  const router = useRouter();
  const outletName = "Hotel kapila";
  const outletCode = "R327038";

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
    <div className="petpooja-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta
          name="description"
          content="KapMeta POS Dining Table View and Floor Management Floor Plan"
        />
      </Head>

      {/* Universal Top PetPooja Titlebar & Header */}
      <PetPoojaHeader
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
          background: #ffffff;
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
