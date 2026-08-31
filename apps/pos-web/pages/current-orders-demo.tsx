import React from "react";
import Head from "next/head";
import PetPoojaHeader from "../components/PetPoojaHeader";
import PetPoojaOrdersView from "../components/PetPoojaOrdersView";

export default function CurrentOrdersDemoPage() {
  const outletName = "Hotel kapila";
  const outletCode = "R327038";

  return (
    <div className="petpooja-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="KapMeta POS Current Orders register and billing status monitor" />
      </Head>

      {/* Universal PetPooja Top Header */}
      <PetPoojaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => {}}
      />

      {/* Main PetPooja Current Orders View */}
      <PetPoojaOrdersView
        onBackToPos={() => {}}
      />

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f8fafc;
          overflow: hidden;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
