import React from "react";
import Head from "next/head";
import PetPoojaHeader from "../components/PetPoojaHeader";
import PetPoojaKotView from "../components/PetPoojaKotView";

export default function KotViewDemoPage() {
  const outletName = "Hotel kapila";
  const outletCode = "R327038";

  return (
    <div className="petpooja-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Top Universal Window Titlebar & Header */}
      <PetPoojaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => {}}
      />

      {/* Main KOT View (Exact Screenshot Match: 8 KOT Cards, 4 Columns, Pick Up, MM:SS Timers, MFR Input) */}
      <PetPoojaKotView
        onBackToPos={() => {}}
        onMarkFoodReady={(id) => {
          console.log("KOT Marked Food Ready:", id);
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
