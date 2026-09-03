import React from "react";
import Head from "next/head";
import ShakuroSalesAnalytics from "../components/analytics/ShakuroSalesAnalytics";

export default function ReportingPage() {
  return (
    <>
      <Head>
        <title>Sales Analytics & BI Dashboard | KapMeta POS</title>
        <meta name="description" content="Executive Sales Analytics and Business Intelligence Dashboard" />
      </Head>
      <ShakuroSalesAnalytics />
    </>
  );
}
