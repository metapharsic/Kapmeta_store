import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import KapMetaHeader from "../components/KapMetaHeader";
import PendingOrderDetailView, {
  PendingOrderDetailData,
} from "../components/PendingOrderDetailView";
import { authedFetch, fetchMe } from "../lib/auth";

export default function PendingOrderDetailPage() {
  const router = useRouter();
  const { orderId, orderNo } = router.query;
  const [orderData, setOrderData] = useState<PendingOrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState("");
  const [outletCode, setOutletCode] = useState("");

  useEffect(() => {
    fetchMe().then((me) => {
      if (me?.outlet?.name) setOutletName(me.outlet.name);
      if ((me?.outlet as any)?.code) setOutletCode((me?.outlet as any).code);
    });
  }, []);

  useEffect(() => {
    if (!orderId && !orderNo) {
      setLoading(false);
      return;
    }

    const idToFetch = (orderId || orderNo) as string;
    setLoading(true);
    authedFetch(`/orders/${idToFetch}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((ord) => {
        if (!ord) {
          setOrderData(null);
          return;
        }
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
          pendingOrderNo: ord.orderNumber || idToFetch,
          orderFrom: ord.channel ? `${ord.channel} - ${ord.externalOrderId || ord.orderNumber}` : (ord.orderType || "Dine In"),
          customerName: ord.customerName || "Walk-in Guest",
          customerPhone: ord.customerPhone || "N/A",
          customerAddress: ord.deliveryAddress || null,
          noOfPersons: ord.covers || null,
          orderType: ord.orderType === "AGGREGATOR" || ord.orderType === "DELIVERY" ? "Delivery" : ord.orderType,
          paymentType: ord.paymentMethod || "Online",
          advancedOrder: "No",
          preorderDateTime: ord.createdAt
            ? new Date(ord.createdAt).toISOString().replace("T", " ").slice(0, 19)
            : new Date().toISOString().replace("T", " ").slice(0, 19),
          grandTotal: grandTotal > 0 ? grandTotal.toFixed(2) : "0.00",
          orderStatus: ord.status === "ACTIVE" ? "Bill Created" : ord.status || "Bill Created",
          customerNote: ord.notes || "None",
          discountInfo: ord.discountTotalMinor ? `Discount Applied: ₹${(Number(ord.discountTotalMinor) / 100).toFixed(2)}` : null,
          items: items,
          discountAmount: ord.discountTotalMinor
            ? (Number(ord.discountTotalMinor) / 100).toFixed(2)
            : "0.00",
          deliveryCharge: null,
          containerCharge: null,
          serviceCharge: null,
        });
      })
      .catch((err) => {
        console.error("Failed to load order details:", err);
        setOrderData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orderId, orderNo]);

  return (
    <div className="kapmeta-app-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="KapMeta POS Pending Order Details and Breakdown View" />
      </Head>

      {/* Top Universal Window Titlebar & Header */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => router.push("/")}
      />

      {/* Main Pending Order Detail View */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 42px)" }}>
          <p style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Loading order details...</p>
        </div>
      ) : (
        <PendingOrderDetailView
          initialData={orderData}
          onBack={() => router.push("/orders?tab=online")}
        />
      )}

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
