import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import PetPoojaHeader from "../components/PetPoojaHeader";
import PendingOrderDetailView, {
  REFERENCE_PENDING_ORDER,
  PendingOrderDetailData,
} from "../components/PendingOrderDetailView";
import { authedFetch } from "../lib/auth";

export default function PendingOrderDetailPage() {
  const router = useRouter();
  const { orderId, orderNo } = router.query;
  const [orderData, setOrderData] = useState<PendingOrderDetailData>(REFERENCE_PENDING_ORDER);

  useEffect(() => {
    if (!orderId && !orderNo) return;

    const idToFetch = (orderId || orderNo) as string;
    authedFetch(`/orders/${idToFetch}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((ord) => {
        if (!ord) return;
        const grandTotal = Number(ord.grandTotalMinor || 0) / 100;
        const items = (ord.items || []).map((it: any) => ({
          id: it.id || it.menuItemId,
          name: it.menuItemName || it.name,
          specialNote: it.notes || "--",
          availability: "Yes",
          quantity: it.quantity || 1,
          unitPrice: Number(it.unitPriceMinor || it.subtotalMinor || 0) / 100,
          totalPrice: (Number(it.subtotalMinor || it.unitPriceMinor || 0) / 100) * (it.quantity || 1),
        }));

        setOrderData({
          pendingOrderNo: ord.orderNumber || REFERENCE_PENDING_ORDER.pendingOrderNo,
          orderFrom: ord.channel ? `${ord.channel} - ${ord.externalOrderId || ord.orderNumber}` : REFERENCE_PENDING_ORDER.orderFrom,
          customerName: ord.customerName || REFERENCE_PENDING_ORDER.customerName,
          customerPhone: ord.customerPhone || REFERENCE_PENDING_ORDER.customerPhone,
          customerAddress: ord.deliveryAddress || null,
          noOfPersons: ord.covers || null,
          orderType: ord.orderType === "AGGREGATOR" || ord.orderType === "DELIVERY" ? "Delivery" : ord.orderType,
          paymentType: "Online",
          advancedOrder: "No",
          preorderDateTime: ord.createdAt
            ? new Date(ord.createdAt).toISOString().replace("T", " ").slice(0, 19)
            : REFERENCE_PENDING_ORDER.preorderDateTime,
          grandTotal: grandTotal > 0 ? grandTotal.toFixed(2) : REFERENCE_PENDING_ORDER.grandTotal,
          orderStatus: ord.status === "ACTIVE" ? "Bill Created" : ord.status || "Bill Created",
          customerNote: ord.notes || REFERENCE_PENDING_ORDER.customerNote,
          discountInfo: REFERENCE_PENDING_ORDER.discountInfo,
          items: items.length > 0 ? items : REFERENCE_PENDING_ORDER.items,
          discountAmount: ord.discountTotalMinor
            ? (Number(ord.discountTotalMinor) / 100).toFixed(1)
            : REFERENCE_PENDING_ORDER.discountAmount,
          deliveryCharge: null,
          containerCharge: null,
          serviceCharge: null,
        });
      })
      .catch(() => {});
  }, [orderId, orderNo]);

  const outletName = "Hotel kapila";
  const outletCode = "R327038";

  return (
    <div className="petpooja-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="KapMeta POS Pending Order Details and Breakdown View" />
      </Head>

      {/* Top Universal Window Titlebar & Header */}
      <PetPoojaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => router.push("/")}
      />

      {/* Main Pending Order Detail View */}
      <PendingOrderDetailView
        initialData={orderData}
        onBack={() => router.push("/orders?tab=online")}
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
