import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuthGuard } from "../lib/auth";
import KapMetaHeader from "../components/KapMetaHeader";
import KapMetaOrdersView from "../components/KapMetaOrdersView";

/**
 * The orders register. Each of the four tabs (Live Orders, All Orders,
 * Online Orders, Advance Order) is its own screen with its own endpoint, so
 * this page only owns the chrome: auth, the outlet header, and deep links.
 */
export default function OrdersPage() {
  const { me, loading: authLoading } = useAuthGuard("order.read");
  const router = useRouter();

  const outletName = me?.outlet?.name || "";
  const outletCode = me?.outlet?.code || me?.outlet?.taxNumber || "";
  const documentTitle = outletName
    ? `${outletName}${outletCode ? ` (${outletCode})` : ""} - Orders`
    : "Orders";

  // Older links (the header quick-search used to emit `/orders?id=…`) point at
  // a single order; send them to the detail screen rather than dropping them.
  useEffect(() => {
    const id = router.query.id;
    if (!authLoading && id) {
      router.replace(`/pending-order-detail?orderId=${encodeURIComponent(String(id))}`);
    }
  }, [authLoading, router]);

  return (
    <div className="kapmeta-orders-page-root">
      <Head>
        <title>{documentTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta
          name="description"
          content="KapMeta POS orders register: live orders, all orders, online aggregator orders and advance orders."
        />
      </Head>

      <KapMetaHeader
        outletName={outletName}
        outletCode={outletCode}
        onNewOrder={() => router.push("/")}
      />

      <KapMetaOrdersView
        onBackToPos={() => router.push("/")}
        onViewOrderDetails={(id) => router.push(`/pending-order-detail?orderId=${id}`)}
      />

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
