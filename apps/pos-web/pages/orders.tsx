import React, { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { authedFetch, useAuthGuard } from "../lib/auth";
import KapMetaHeader from "../components/KapMetaHeader";
import KapMetaOrdersView, {
  KapMetaOrderRowData,
} from "../components/KapMetaOrdersView";

interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  grandTotalMinor: string;
  taxTotalMinor: string;
  discountTotalMinor: string;
  createdAt: string;
  itemCount: number;
  diningTableId: string | null;
  channel: string | null;
  externalOrderId: string | null;
  customerName: string | null;
  customerPhone?: string | null;
  paymentMethod: string | null;
}

export default function OrdersPage() {
  const { me, loading: authLoading } = useAuthGuard("order.read");
  const router = useRouter();

  const outletName = me?.outlet?.name || "Hotel kapila";
  const outletCode = me?.outlet?.taxNumber ? `R${me.outlet.taxNumber.slice(0, 6)}` : "R327038";

  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authedFetch("/orders?limit=50");
      if (res.ok) {
        const data = await res.json();
        const list = data.orders || (Array.isArray(data) ? data : []);
        setOrders(list);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    fetchOrders();
    const interval = setInterval(fetchOrders, 20000);
    return () => clearInterval(interval);
  }, [authLoading, fetchOrders]);

  const liveDbOrders: KapMetaOrderRowData[] = orders.map((o) => {
    const grandTotal = Number(o.grandTotalMinor || 0) / 100;
    const tax = Number(o.taxTotalMinor || 0) / 100;
    const discount = Number(o.discountTotalMinor || 0) / 100;
    const myAmount = grandTotal - tax + discount;

    let status: KapMetaOrderRowData["status"] = "PRINTED_BILL";
    if (o.status === "PAID" || o.status === "SETTLED" || o.status === "COMPLETED") {
      status = "PAID";
    } else if (o.status === "CANCELLED" || o.status === "VOIDED") {
      status = "CANCELLED_BILL";
    } else if (o.status === "ACTIVE" || o.status === "PREPARING") {
      status = "SAVED_BILL";
    }

    let typeTitle = "Dine In";
    let typeSubtitle: string | undefined = "(Non AC)";
    const normalizedType = String(o.orderType || "").toUpperCase();
    if (normalizedType === "DELIVERY" || normalizedType === "AGGREGATOR") {
      typeTitle = "Delivery";
      typeSubtitle = o.channel ? `(${o.channel})` : "(Delivery)";
    } else if (
      normalizedType === "PICKUP" ||
      normalizedType === "PICK_UP" ||
      normalizedType === "TAKEAWAY"
    ) {
      typeTitle = "Pick Up";
      typeSubtitle = "(Pick Up)";
    }

    return {
      id: o.id,
      orderNo: o.orderNumber,
      aggregatorTag: o.channel || (o.orderType === "AGGREGATOR" ? "Swiggy" : null),
      orderTypeTitle: typeTitle,
      orderTypeSubtitle: typeSubtitle,
      customerPhone: o.customerPhone || null,
      customerName: o.customerName || null,
      paymentType: o.paymentMethod || (o.channel ? o.channel : "Cash"),
      myAmount,
      tax,
      discount,
      grandTotal,
      created: o.createdAt
        ? new Date(o.createdAt).toISOString().replace("T", " ").slice(0, 19)
        : new Date().toISOString().replace("T", " ").slice(0, 19),
      status,
    };
  });

  const mappedOrders: KapMetaOrderRowData[] = liveDbOrders;

  return (
    <div className="kapmeta-orders-page-root">
      <Head>
        <title>{outletName} ({outletCode}) - The Finest Restaurant Management Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta
          name="description"
          content="KapMeta POS Orders register and live dining management system."
        />
      </Head>

      {/* Top Universal KapMeta Header */}
      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => router.push("/")}
      />

      {/* Main KapMeta POS Current Orders Matrix View */}
      <KapMetaOrdersView
        initialOrders={mappedOrders}
        onBackToPos={() => router.push("/")}
        onViewOrderDetails={(id) => router.push(`/pending-order-detail?orderId=${id}`)}
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
