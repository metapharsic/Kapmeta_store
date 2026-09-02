import React, { useState } from "react";
import Head from "next/head";
import KapMetaHeader from "../components/KapMetaHeader";
import PosBillingView from "../components/PosBillingView";
import MorePaymentModal from "../components/MorePaymentModal";

export default function MorePaymentDemoPage() {
  const outletName = "Hotel kapila";
  const outletCode = "R327038";
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(true);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState("UPI");
  const [isPaid, setIsPaid] = useState(true);

  return (
    <div className="kapmeta-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Top KapMeta Header with window titlebar */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => setIsMoreModalOpen(true)}
      />

      {/* Main POS Billing View with South Indian Breakfast Catalog */}
      <PosBillingView
        initialTable="A1"
        initialMode="DINE_IN"
        onBackToTables={() => {}}
      />

      {/* "More" Payment Options Modal (Open by default for demonstration & exact screenshot match) */}
      <MorePaymentModal
        isOpen={isMoreModalOpen}
        onClose={() => setIsMoreModalOpen(false)}
        currentMethod={currentPaymentMethod}
        isPaid={isPaid}
        totalMinor={45000}
        onSelectMethod={(method, extraData) => {
          setCurrentPaymentMethod(method);
          if (extraData?.isPaid !== undefined) {
            setIsPaid(extraData.isPaid);
          }
          alert(`Selected Payment Method: ${method} (${extraData?.isPaid ? "PAID" : "UNPAID"})${extraData?.roomNumber ? ` - Room ${extraData.roomNumber}` : ""}`);
        }}
        onOpenSplitModal={() => {
          setIsMoreModalOpen(false);
          alert("Opening Split Bill Tender Modal...");
        }}
      />

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg-base);
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
