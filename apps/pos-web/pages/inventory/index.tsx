import React, { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import InventorySidebar from "../../components/inventory/InventorySidebar";
import InventoryHeader from "../../components/inventory/InventoryHeader";
import A2aAgentStatusDrawer from "../../components/A2aAgentStatusDrawer";

export default function InventoryDashboardPage() {
  const { me, loading: authLoading } = useAuthGuard("inventory.read");
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState("September");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [purchaseDaysFilter, setPurchaseDaysFilter] = useState("Last 15 Days");
  const [purchaseTopFilter, setPurchaseTopFilter] = useState("Top 10");
  const [pendingDaysFilter, setPendingDaysFilter] = useState("Last 7 days");

  // Modals
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [showAddNowModal, setShowAddNowModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showOldDashboard, setShowOldDashboard] = useState(false);

  // Closing modal state
  const [closingNotes, setClosingNotes] = useState("");
  const [closingItems, setClosingItems] = useState<{ ingredientId: string; name: string; unit: string; openingQty: number; actualQty: number; unitCostMinor: number }[]>([]);
  const [submittingClosing, setSubmittingClosing] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/inventory/dashboard/summary");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load inventory dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedMockData = async () => {
    try {
      await authedFetch("/inventory/seed-mock-data", { method: "POST" });
      fetchDashboardData();
    } catch (e) {
      console.error("Error seeding data:", e);
    }
  };

  const handleOpenClosingModal = async () => {
    try {
      const res = await authedFetch("/inventory/ingredients");
      if (res.ok) {
        const ings = await res.json();
        setClosingItems(
          ings.map((ing: any) => ({
            ingredientId: ing.id,
            name: ing.name,
            unit: ing.unitOfMeasure,
            openingQty: ing.currentStock || 0,
            actualQty: ing.currentStock || 0,
            unitCostMinor: Math.round((ing.unitCost || 0) * 100),
          }))
        );
      }
    } catch (e) {
      console.error(e);
    }
    setShowClosingModal(true);
  };

  const handleSaveClosing = async () => {
    setSubmittingClosing(true);
    try {
      const res = await authedFetch("/inventory/closing-tracker", {
        method: "POST",
        body: JSON.stringify({
          closingDate: new Date().toISOString().split("T")[0],
          notes: closingNotes,
          items: closingItems.map((it) => ({
            ingredientId: it.ingredientId,
            openingQty: it.openingQty,
            actualClosingQty: Number(it.actualQty),
            unitCostMinor: it.unitCostMinor,
          })),
        }),
      });
      if (res.ok) {
        setShowClosingModal(false);
        fetchDashboardData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingClosing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const d = useMemo(() => {
    return {
      dailyStockClosingTracker: {
        updateAccuracyPercent: data?.dailyStockClosingTracker?.updateAccuracyPercent ?? 0,
        isUpToDate: data?.dailyStockClosingTracker?.isUpToDate ?? false,
        daysUpdatedCount: data?.dailyStockClosingTracker?.daysUpdatedCount ?? 0,
        daysMissedCount: data?.dailyStockClosingTracker?.daysMissedCount ?? 1,
        monthName: data?.dailyStockClosingTracker?.monthName ?? "September",
        year: data?.dailyStockClosingTracker?.year ?? 2026,
        totalDaysInMonth: data?.dailyStockClosingTracker?.totalDaysInMonth ?? 30,
        dayProgress: data?.dailyStockClosingTracker?.dayProgress || Array.from({ length: 30 }, (_, i) => ({
          day: i + 1,
          status: i === 0 ? "MISSED" : i === 1 ? "TODAY" : "UPCOMING",
        })),
      },
      inventoryOverview: {
        rawMaterialsCount: data?.inventoryOverview?.rawMaterialsCount ?? 412,
        recipesCount: data?.inventoryOverview?.recipesCount ?? 167,
        readyToAddCount: data?.inventoryOverview?.readyToAddCount ?? 412,
        readyToAddRecipesCount: data?.inventoryOverview?.readyToAddRecipesCount ?? 167,
      },
      currentInventory: {
        totalStockWorthFormatted: data?.currentInventory?.totalStockWorthFormatted || "₹ 2,60,500",
        lowStockPercent: data?.currentInventory?.lowStockPercent ?? 40,
        lowStockAlerts: data?.currentInventory?.lowStockAlerts || [
          { id: "1", name: "Sprite", daysRemaining: 8, currentStock: 12, unit: "pcs", category: "Beverages" },
          { id: "2", name: "7 up", daysRemaining: 3, currentStock: 6, unit: "pcs", category: "Beverages" },
          { id: "3", name: "Butter", daysRemaining: 5, currentStock: 8, unit: "kg", category: "Groceries" },
          { id: "4", name: "Eggs", daysRemaining: 4, currentStock: 9, unit: "tray", category: "Groceries" },
        ],
        categoryDistribution: data?.currentInventory?.categoryDistribution || [
          { category: "Groceries", count: 240, valueFormatted: "₹ 1,50,000" },
          { category: "Beverages", count: 85, valueFormatted: "₹ 60,500" },
          { category: "Dairy", count: 52, valueFormatted: "₹ 35,000" },
          { category: "Produce", count: 35, valueFormatted: "₹ 15,000" },
        ],
      },
      cogsBreakdown: {
        totalCogsFormatted: data?.cogsBreakdown?.totalCogsFormatted || "₹ 1,10,500",
        highestProfitItem: data?.cogsBreakdown?.highestProfitItem || { name: "Matar Paneer", description: "Highest Profit Generating Item" },
        leastProfitItem: data?.cogsBreakdown?.leastProfitItem || { name: "Bhindi Masala", description: "Least Profit Generating Item" },
        ingredientCogs: data?.cogsBreakdown?.ingredientCogs || [
          { name: "Tomatoes", costFormatted: "₹1240" },
          { name: "Cucumbers", costFormatted: "₹1000" },
          { name: "Bell Peppers", costFormatted: "₹1500" },
          { name: "Zucchini", costFormatted: "₹1110" },
          { name: "Carrots", costFormatted: "₹980" },
          { name: "Eggplants", costFormatted: "₹1490" },
        ],
      },
      purchaseInsights: {
        totalPurchaseFormatted: data?.purchaseInsights?.totalPurchaseFormatted || "₹ 10,10,500",
        pendingPaymentFormatted: data?.purchaseInsights?.pendingPaymentFormatted || "₹ 10,105",
        priceTrends: data?.purchaseInsights?.priceTrends || [
          { name: "Bread", prices: [105, 100, 120, 150] },
          { name: "Eggs", prices: [70, 80, 65, 90] },
          { name: "Butter", prices: [140, 150, 165, 180, 155] },
          { name: "Milk", prices: [45, 70, 50, 55, 60] },
        ],
        supplierWise: data?.purchaseInsights?.supplierWise || [
          { id: "1", name: "Supplier A", currentPurchaseFormatted: "₹ 2,00,500", pendingPaymentFormatted: "₹ 20,500" },
          { id: "2", name: "Supplier B", currentPurchaseFormatted: "₹ 60,500", pendingPaymentFormatted: "₹ 4,500" },
          { id: "3", name: "Supplier C", currentPurchaseFormatted: "₹ 75,200", pendingPaymentFormatted: "₹ 20,500" },
          { id: "4", name: "Supplier D", currentPurchaseFormatted: "₹ 82,300", pendingPaymentFormatted: "₹ 20,000" },
          { id: "5", name: "Supplier E", currentPurchaseFormatted: "₹ 50,750", pendingPaymentFormatted: "₹ 10,500" },
        ],
      },
      pendingTasks: {
        totalCount: data?.pendingTasks?.totalCount ?? 0,
        orders: data?.pendingTasks?.orders || [],
      },
    };
  }, [data]);

  return (
    <div style={styles.pageLayout}>
      <Head>
        <title>Inventory Dashboard — PetPooja POSS</title>
      </Head>

      {/* Persistent Inventory Sidebar */}
      <InventorySidebar onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

      {/* Main Content Area */}
      <div style={styles.mainWrapper}>
        <InventoryHeader onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

        <main style={styles.content}>
          {/* Top Row: Daily Stock Closing Tracker */}
          <div style={styles.sectionHeaderRow}>
            <div>
              <h1 style={styles.sectionTitle}>Daily Stock Closing Tracker</h1>
              <p style={styles.sectionSubtitle}>
                Track timely stock closing and monitor manual adjustments to ensure accurate inventory and avoid mismatches through regular updates.
              </p>
            </div>
            <Link href="/inventory/classic" style={styles.oldDashboardBtn}>
              Old Dashboard
            </Link>
          </div>

          {/* Daily Tracker Widget Card */}
          <div style={styles.trackerCard}>
            <div style={styles.trackerLeft}>
              <div style={styles.accuracyRow}>
                <span style={styles.accuracyNumber}>{d.dailyStockClosingTracker.updateAccuracyPercent}%</span>
                <span style={styles.accuracyLabel}>Update Accuracy.</span>
              </div>
              <div style={styles.accuracyWarning}>Stock records are not up to date.</div>
              <div style={styles.accuracySub}>
                Closing stock has been updated on <strong>{d.dailyStockClosingTracker.daysUpdatedCount} days</strong> this month.
              </div>
              <div style={styles.missedRow}>
                <span style={styles.missedText}>{d.dailyStockClosingTracker.daysMissedCount} days missed.</span>
                <div style={styles.missedBarContainer}>
                  <div style={{ ...styles.missedBarFill, width: `${Math.min(100, d.dailyStockClosingTracker.daysMissedCount * 10)}%` }} />
                </div>
              </div>
            </div>

            <div style={styles.trackerRight}>
              <div style={styles.monthHeaderRow}>
                <span style={styles.monthTitle}>{d.dailyStockClosingTracker.monthName}'s {d.dailyStockClosingTracker.year} Progress.</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={styles.monthSelect}>
                  <option value="September">September</option>
                  <option value="August">August</option>
                  <option value="July">July</option>
                </select>
              </div>

              {/* Day badges grid */}
              <div style={styles.daysGrid}>
                {d.dailyStockClosingTracker.dayProgress.map((item: any) => {
                  let badgeStyle = styles.dayBadgeUpcoming;
                  if (item.status === "MISSED") badgeStyle = styles.dayBadgeMissed;
                  else if (item.status === "TODAY") badgeStyle = styles.dayBadgeToday;
                  else if (item.status === "UPDATED") badgeStyle = styles.dayBadgeUpdated;

                  return (
                    <div key={item.day} style={badgeStyle} title={`Day ${item.day}: ${item.status}`}>
                      {item.day}
                    </div>
                  );
                })}
              </div>

              <div style={styles.updateTodayRow}>
                <button onClick={handleOpenClosingModal} style={styles.updateTodayBtn}>
                  Update Today's Closing
                </button>
              </div>
            </div>
          </div>

          {/* Section: Inventory Overview */}
          <div style={{ marginTop: 32 }}>
            <h2 style={styles.sectionTitle}>Inventory Overview</h2>
            <p style={styles.sectionSubtitle}>
              From stock levels to pending recipes and POs — get real-time visibility into every part of your inventory process.
            </p>

            <div style={styles.overviewGrid}>
              {/* Ready to add card with AI prompt */}
              <div style={styles.aiReadyCard}>
                <div style={styles.aiReadyTitle}>
                  {d.inventoryOverview.readyToAddCount} Raw Materials And {d.inventoryOverview.readyToAddRecipesCount} Recipes Are Ready To Add
                </div>
                <div style={styles.aiReadySub}>
                  🔒 AI-generated raw materials and recipes are ready. Add now for better inventory insights.
                </div>
                <button onClick={handleSeedMockData} style={styles.addNowBtn}>
                  + Add Now
                </button>
              </div>

              {/* Raw materials metric */}
              <div style={styles.metricCard}>
                <div style={styles.metricBigNumber}>{d.inventoryOverview.rawMaterialsCount}</div>
                <div style={styles.metricBigLabel}>Raw Materials</div>
              </div>

              {/* Recipes metric */}
              <div style={styles.metricCard}>
                <div style={styles.metricBigNumber}>{d.inventoryOverview.recipesCount}</div>
                <div style={styles.metricBigLabel}>Recipes</div>
              </div>
            </div>
          </div>

          {/* Section: Current Inventory */}
          <div style={{ marginTop: 32 }}>
            <h2 style={styles.sectionTitle}>Current Inventory</h2>
            <p style={styles.sectionSubtitle}>
              Track your current inventory and identify items that need restocking.
            </p>

            <div style={styles.currentInventoryGrid}>
              {/* Worth of Stocks Card */}
              <div style={styles.currentCardSmall}>
                <div style={styles.currentCardTop}>
                  <div style={styles.currentCardValue}>{d.currentInventory.totalStockWorthFormatted}</div>
                  <span style={styles.currentCardArrow}>→</span>
                </div>
                <div style={styles.currentCardLabel}>Worth of Stocks</div>
              </div>

              {/* Low Stock Alert List Card */}
              <div style={styles.lowStockCard}>
                <div style={styles.lowStockHeader}>
                  <div style={styles.lowStockTitle}>Low Stock Alert</div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={styles.categoryDropdown}
                  >
                    <option value="All Categories">All Categories</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Beverages">Beverages</option>
                  </select>
                </div>

                <div style={styles.lowStockList}>
                  {d.currentInventory.lowStockAlerts.map((it: any) => (
                    <div key={it.id} style={styles.lowStockRow}>
                      <span style={styles.lowStockItemName}>{it.name}</span>
                      <div style={styles.lowStockBarTrack}>
                        <div style={{ ...styles.lowStockBarFill, width: `${Math.min(100, it.daysRemaining * 12)}%` }} />
                      </div>
                      <span style={styles.lowStockDays}>{it.daysRemaining} Days</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category Breakdown Card */}
              <div style={styles.categoryPieCard}>
                <div style={styles.categoryPieHeader}>
                  <div style={styles.lowStockTitle}>Category Distribution</div>
                  <select style={styles.categoryDropdown}>
                    <option>All Categories</option>
                  </select>
                </div>
                <div style={styles.pieContent}>
                  {/* Visual SVG Donut Chart */}
                  <svg width="120" height="120" viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#eff6ff" strokeWidth="6"></circle>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="6" strokeDasharray="60 40" strokeDashoffset="25"></circle>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f59e0b" strokeWidth="6" strokeDasharray="25 75" strokeDashoffset="85"></circle>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="6" strokeDasharray="15 85" strokeDashoffset="10"></circle>
                  </svg>
                  <div style={styles.categoryLegend}>
                    {d.currentInventory.categoryDistribution.map((cat: any) => (
                      <div key={cat.category} style={styles.legendItem}>
                        <span style={styles.legendBullet}>●</span>
                        <span style={styles.legendText}>{cat.category} ({cat.count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: COGS Breakdown */}
          <div style={{ marginTop: 32 }}>
            <h2 style={styles.sectionTitle}>COGS Breakdown</h2>
            <p style={styles.sectionSubtitle}>
              Track your current inventory and identify items that need restocking.
            </p>

            <div style={styles.cogsGrid}>
              {/* Left column: 3 small metric cards */}
              <div style={styles.cogsLeftCol}>
                <div style={styles.cogsMetricCard}>
                  <div style={styles.cogsCardTop}>
                    <span style={styles.cogsIconSquare}>📊</span>
                    <span style={styles.cogsValue}>{d.cogsBreakdown.totalCogsFormatted}</span>
                    <span style={styles.currentCardArrow}>→</span>
                  </div>
                  <div style={styles.cogsLabel}>COGS</div>
                </div>

                <div style={styles.cogsMetricCard}>
                  <div style={styles.cogsCardTop}>
                    <span style={styles.cogsProfitTitle}>{d.cogsBreakdown?.highestProfitItem?.name || "Matar Paneer"}</span>
                    <span style={styles.currentCardArrow}>→</span>
                  </div>
                  <div style={styles.cogsLabel}>{d.cogsBreakdown?.highestProfitItem?.description || "Highest Profit Generating Item"}</div>
                </div>

                <div style={styles.cogsMetricCard}>
                  <div style={styles.cogsCardTop}>
                    <span style={styles.cogsProfitTitle}>{d.cogsBreakdown?.leastProfitItem?.name || "Bhindi Masala"}</span>
                    <span style={styles.currentCardArrow}>→</span>
                  </div>
                  <div style={styles.cogsLabel}>{d.cogsBreakdown?.leastProfitItem?.description || "Least Profit Generating Item"}</div>
                </div>
              </div>

              {/* Right column: Ingredient Cost Bar Chart with Ingestion Callout */}
              <div style={styles.cogsChartCard}>
                <div style={styles.ingredientBarList}>
                  {d.cogsBreakdown.ingredientCogs.map((ing: any) => (
                    <div key={ing.name} style={styles.ingredientBarRow}>
                      <span style={styles.ingredientName}>{ing.name}</span>
                      <div style={styles.barTrack}>
                        <div style={{ ...styles.barFillBlue, width: "65%" }} />
                      </div>
                      <span style={styles.ingredientCost}>{ing.costFormatted}</span>
                    </div>
                  ))}
                </div>

                {/* Ingestion Callout Card Overlaid */}
                <div style={styles.promptCalloutBox}>
                  <div style={styles.promptIcon}>📈</div>
                  <div style={styles.promptTitle}>Want To See What's Driving Your Costs?</div>
                  <div style={styles.promptSub}>
                    To View Ingredient-Level COGS Breakdown And Identify Profit Or Loss Drivers, Please Update Your Raw Material And Recipe Master.
                  </div>
                  <button onClick={() => setShowMasterModal(true)} style={styles.updateNowBtn}>
                    Update Now
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Purchase Insights */}
          <div style={{ marginTop: 32 }}>
            <h2 style={styles.sectionTitle}>Purchase Insights</h2>
            <p style={styles.sectionSubtitle}>
              Get a complete picture of your purchase history, pricing patterns, and supplier-wise breakdown.
            </p>

            <div style={styles.purchaseTopRow}>
              <div style={styles.currentCardSmall}>
                <div style={styles.currentCardTop}>
                  <div style={styles.currentCardValue}>{d.purchaseInsights.totalPurchaseFormatted}</div>
                  <span style={styles.currentCardArrow}>→</span>
                </div>
                <div style={styles.currentCardLabel}>Total Purchase</div>
              </div>

              <div style={styles.currentCardSmall}>
                <div style={styles.currentCardTop}>
                  <div style={styles.currentCardValue}>{d.purchaseInsights.pendingPaymentFormatted}</div>
                  <span style={styles.currentCardArrow}>→</span>
                </div>
                <div style={styles.currentCardLabel}>Pending Payment</div>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <select value={purchaseTopFilter} onChange={(e) => setPurchaseTopFilter(e.target.value)} style={styles.filterSelect}>
                  <option value="Top 10">Top 10</option>
                  <option value="Top 5">Top 5</option>
                </select>
                <select value={purchaseDaysFilter} onChange={(e) => setPurchaseDaysFilter(e.target.value)} style={styles.filterSelect}>
                  <option value="Last 15 Days">Last 15 Days</option>
                  <option value="Last 30 Days">Last 30 Days</option>
                </select>
              </div>
            </div>

            {/* Price Trends & Supplier Breakdown Matrix */}
            <div style={styles.insightsMatrixCard}>
              {/* Left: Item Rate Matrix */}
              <div style={styles.rateMatrixCol}>
                <div style={styles.matrixHeader}>Item Rate History</div>
                {d.purchaseInsights.priceTrends.map((pt: any) => (
                  <div key={pt.name} style={styles.rateMatrixRow}>
                    <span style={styles.rateItemName}>{pt.name}</span>
                    <div style={styles.priceChipsRow}>
                      {pt.prices.map((p: number, idx: number) => (
                        <span key={idx} style={styles.priceChip}>
                          ₹{p}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Supplier Bar Graph with Update Callout */}
              <div style={styles.supplierGraphCol}>
                <div style={styles.supplierBars}>
                  {d.purchaseInsights.supplierWise.map((sup: any) => (
                    <div key={sup.id} style={styles.supplierBarItem}>
                      <div style={styles.supplierBarStack}>
                        <div style={{ ...styles.stackPending, height: "35px" }} title={`Pending: ${sup.pendingPaymentFormatted}`} />
                        <div style={{ ...styles.stackCurrent, height: "85px" }} title={`Current: ${sup.currentPurchaseFormatted}`} />
                      </div>
                      <div style={styles.supplierName}>{sup.name}</div>
                      <div style={styles.supplierValue}>{sup.currentPurchaseFormatted}</div>
                      <div style={styles.supplierPendingValue}>{sup.pendingPaymentFormatted}</div>
                    </div>
                  ))}
                </div>

                <div style={styles.supplierLegendRow}>
                  <div style={styles.legendDotCurrent}>○ Current Purchase</div>
                  <div style={styles.legendDotPending}>○ Pending Purchase</div>
                </div>

                {/* Prompt callout */}
                <div style={styles.promptCalloutBox}>
                  <div style={styles.promptIcon}>📈</div>
                  <div style={styles.promptTitle}>Get Insights Into Your Purchase Trends</div>
                  <div style={styles.promptSub}>
                    To View Detailed Purchase Analytics And Supplier Breakdowns, Please Update Your Purchase Records.
                  </div>
                  <Link href="/inventory/purchase" style={styles.updateNowBtnLink}>
                    Update Now
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Pending Tasks */}
          <div style={{ marginTop: 32 }}>
            <div style={styles.pendingHeaderRow}>
              <div>
                <h2 style={styles.sectionTitle}>Pending Tasks</h2>
                <p style={styles.sectionSubtitle}>
                  Get a complete view of your purchase orders, showing which POs are pending and their current stage.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select value={pendingDaysFilter} onChange={(e) => setPendingDaysFilter(e.target.value)} style={styles.filterSelect}>
                  <option value="Last 7 days">Last 7 days</option>
                  <option value="Last 15 days">Last 15 days</option>
                </select>
                <button onClick={fetchDashboardData} style={styles.refreshBtn} title="Refresh PO Data">
                  🔄
                </button>
              </div>
            </div>

            <div style={styles.pendingTasksBox}>
              {d.pendingTasks.orders.length > 0 ? (
                <div style={styles.pendingTable}>
                  {d.pendingTasks.orders.map((po: any) => (
                    <div key={po.id} style={styles.pendingRow}>
                      <span style={styles.poNumber}>{po.poNumber}</span>
                      <span style={styles.poVendor}>{po.vendorName}</span>
                      <span style={styles.poAmount}>{po.amountFormatted}</span>
                      <span style={styles.poStatus}>{po.status}</span>
                      <Link href="/inventory/purchase-orders" style={styles.poViewBtn}>
                        View →
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyPendingState}>
                  <div style={styles.emptyDocIcon}>📄🔍</div>
                  <div style={styles.emptyPendingText}>No Pending Order Data Found</div>
                  <Link href="/inventory/purchase-orders" style={styles.createPoSmallBtn}>
                    + Create Purchase Order
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Customize Banner */}
          <div style={styles.customizeBanner}>
            <div style={styles.customizeBannerLeft}>
              <span style={styles.bulbIcon}>💡</span>
              <span style={styles.customizeText}>
                Here, You can customise the inventory dashboard, view the necessary widgets, and adjust the widget's priority.
              </span>
            </div>
            <button onClick={() => setShowCustomizeModal(true)} style={styles.customizeBtn}>
              Customize
            </button>
          </div>
        </main>
      </div>

      {/* Update Today's Closing Modal */}
      {showClosingModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCardLarge}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Update Today's Closing Stock</h3>
                <p style={styles.modalSub}>Physical verification for {new Date().toLocaleDateString("en-IN")}</p>
              </div>
              <button onClick={() => setShowClosingModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBodyScroll}>
              <table style={styles.closingTable}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>Ingredient</th>
                    <th style={styles.th}>Unit</th>
                    <th style={styles.th}>Opening / System Qty</th>
                    <th style={styles.th}>Physical Closing Qty</th>
                    <th style={styles.th}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {closingItems.map((item, idx) => {
                    const variance = Number(item.actualQty) - item.openingQty;
                    return (
                      <tr key={item.ingredientId} style={styles.tr}>
                        <td style={styles.tdBold}>{item.name}</td>
                        <td style={styles.td}>{item.unit}</td>
                        <td style={styles.td}>{item.openingQty}</td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            value={item.actualQty}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updated = [...closingItems];
                              updated[idx].actualQty = val;
                              setClosingItems(updated);
                            }}
                            style={styles.qtyInput}
                          />
                        </td>
                        <td style={{ ...styles.td, color: variance < 0 ? "#dc2626" : variance > 0 ? "#16a34a" : "#64748b" }}>
                          {variance > 0 ? `+${variance}` : variance} {item.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: 16 }}>
                <label style={styles.fieldLabel}>Closing Notes & Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. End of day count verified by store manager"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  style={styles.textInput}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowClosingModal(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleSaveClosing} disabled={submittingClosing} style={styles.saveBtn}>
                {submittingClosing ? "Saving Closing..." : "Confirm & Update Closing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Agent & A2A Operations Drawer */}
      <A2aAgentStatusDrawer isOpen={isAgentModalOpen} onClose={() => setIsAgentModalOpen(false)} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageLayout: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  mainWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  content: {
    padding: "24px 32px 64px",
    maxWidth: 1400,
    width: "100%",
    margin: "0 auto",
  },
  sectionHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: "0.82rem",
    color: "#64748b",
    margin: "4px 0 0",
  },
  oldDashboardBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  trackerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "24px 28px",
    display: "flex",
    gap: 32,
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  trackerLeft: {
    width: "35%",
    borderRight: "1px solid #f1f5f9",
    paddingRight: 24,
  },
  accuracyRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  accuracyNumber: {
    fontSize: "1.8rem",
    fontWeight: 900,
    color: "#0f172a",
  },
  accuracyLabel: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  accuracyWarning: {
    color: "#dc2626",
    fontSize: "0.85rem",
    fontWeight: 700,
    marginTop: 6,
  },
  accuracySub: {
    color: "#64748b",
    fontSize: "0.82rem",
    marginTop: 6,
  },
  missedRow: {
    marginTop: 24,
  },
  missedText: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  missedBarContainer: {
    height: 6,
    backgroundColor: "#fee2e2",
    borderRadius: 999,
    marginTop: 8,
    overflow: "hidden",
  },
  missedBarFill: {
    height: "100%",
    backgroundColor: "#ef4444",
  },
  trackerRight: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  monthHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  monthTitle: {
    fontSize: "0.95rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  monthSelect: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: "0.82rem",
    color: "#0f172a",
    fontWeight: 600,
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(15, 1fr)",
    gap: 8,
    marginBottom: 20,
  },
  dayBadgeUpcoming: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#94a3b8",
    fontSize: "0.8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
  },
  dayBadgeMissed: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    border: "1.5px solid #ef4444",
    color: "#dc2626",
    fontSize: "0.8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  dayBadgeToday: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    border: "1.5px dashed #0f172a",
    color: "#0f172a",
    fontSize: "0.8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  dayBadgeUpdated: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#f0fdf4",
    border: "1.5px solid #16a34a",
    color: "#16a34a",
    fontSize: "0.8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  updateTodayRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "auto",
  },
  updateTodayBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: "0.85rem",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  overviewGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: 16,
    marginTop: 14,
  },
  aiReadyCard: {
    background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
    borderRadius: 12,
    border: "1px solid #ddd6fe",
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
  },
  aiReadyTitle: {
    fontSize: "1rem",
    fontWeight: 800,
    color: "#4c1d95",
  },
  aiReadySub: {
    fontSize: "0.78rem",
    color: "#6d28d9",
    marginTop: 4,
    marginBottom: 14,
  },
  addNowBtn: {
    padding: "6px 18px",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    border: "1px solid #c4b5fd",
    color: "#6d28d9",
    fontSize: "0.82rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  metricCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  metricBigNumber: {
    fontSize: "2rem",
    fontWeight: 900,
    color: "#0f172a",
  },
  metricBigLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#64748b",
    marginTop: 4,
  },
  currentInventoryGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 2fr 1.8fr",
    gap: 16,
    marginTop: 14,
  },
  currentCardSmall: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  currentCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currentCardValue: {
    fontSize: "1.4rem",
    fontWeight: 900,
    color: "#0f172a",
  },
  currentCardArrow: {
    fontSize: "1.2rem",
    color: "#cbd5e1",
  },
  currentCardLabel: {
    fontSize: "0.82rem",
    color: "#64748b",
    fontWeight: 600,
    marginTop: 8,
  },
  lowStockCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "20px",
  },
  lowStockHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  lowStockTitle: {
    fontSize: "0.92rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  categoryDropdown: {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: "0.78rem",
    color: "#475569",
  },
  lowStockList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  lowStockRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  lowStockItemName: {
    width: 70,
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#0f172a",
  },
  lowStockBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 999,
    overflow: "hidden",
  },
  lowStockBarFill: {
    height: "100%",
    backgroundColor: "#bfdbfe",
  },
  lowStockDays: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#64748b",
    width: 50,
    textAlign: "right",
  },
  categoryPieCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "20px",
  },
  categoryPieHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pieContent: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  categoryLegend: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.78rem",
    color: "#475569",
  },
  legendBullet: {
    fontSize: "0.6rem",
    color: "#3b82f6",
  },
  legendText: {
    fontWeight: 600,
  },
  cogsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 2.5fr",
    gap: 16,
    marginTop: 14,
  },
  cogsLeftCol: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cogsMetricCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "16px 20px",
  },
  cogsCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cogsIconSquare: {
    fontSize: "1.1rem",
  },
  cogsValue: {
    fontSize: "1.25rem",
    fontWeight: 900,
    color: "#0f172a",
  },
  cogsProfitTitle: {
    fontSize: "1rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  cogsLabel: {
    fontSize: "0.78rem",
    color: "#64748b",
    fontWeight: 600,
    marginTop: 6,
  },
  cogsChartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "24px",
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  ingredientBarList: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    opacity: 0.6,
  },
  ingredientBarRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  ingredientName: {
    width: 90,
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#475569",
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFillBlue: {
    height: "100%",
    backgroundColor: "#dbeafe",
  },
  ingredientCost: {
    width: 60,
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#64748b",
    textAlign: "right",
  },
  promptCalloutBox: {
    position: "absolute",
    inset: "20px auto 20px 50%",
    transform: "translateX(-50%)",
    width: 340,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1.5px solid #fef08a",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)",
  },
  promptIcon: {
    fontSize: "1.3rem",
    marginBottom: 6,
  },
  promptTitle: {
    fontSize: "0.88rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  promptSub: {
    fontSize: "0.75rem",
    color: "#64748b",
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 1.4,
  },
  updateNowBtn: {
    padding: "6px 18px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#0f172a",
    cursor: "pointer",
  },
  updateNowBtnLink: {
    padding: "6px 18px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#0f172a",
    textDecoration: "none",
    cursor: "pointer",
  },
  purchaseTopRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    marginTop: 14,
  },
  filterSelect: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: "0.82rem",
    color: "#0f172a",
    fontWeight: 600,
  },
  insightsMatrixCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "24px",
    display: "grid",
    gridTemplateColumns: "1.2fr 2fr",
    gap: 24,
    marginTop: 16,
  },
  rateMatrixCol: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    borderRight: "1px solid #f1f5f9",
    paddingRight: 20,
  },
  matrixHeader: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 6,
  },
  rateMatrixRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rateItemName: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#475569",
  },
  priceChipsRow: {
    display: "flex",
    gap: 6,
  },
  priceChip: {
    padding: "4px 10px",
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#2563eb",
  },
  supplierGraphCol: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  supplierBars: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 180,
    opacity: 0.5,
  },
  supplierBarItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  supplierBarStack: {
    display: "flex",
    flexDirection: "column-reverse",
    width: 32,
    borderRadius: 4,
    overflow: "hidden",
  },
  stackCurrent: {
    backgroundColor: "#bbf7d0",
  },
  stackPending: {
    backgroundColor: "#fed7aa",
  },
  supplierName: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  supplierValue: {
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  supplierPendingValue: {
    fontSize: "0.72rem",
    color: "#ef4444",
  },
  supplierLegendRow: {
    display: "flex",
    justifyContent: "center",
    gap: 20,
    marginTop: 16,
    fontSize: "0.78rem",
  },
  legendDotCurrent: {
    color: "#16a34a",
    fontWeight: 600,
  },
  legendDotPending: {
    color: "#ea580c",
    fontWeight: 600,
  },
  pendingHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pendingTasksBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "32px",
    minHeight: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPendingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  emptyDocIcon: {
    fontSize: "2rem",
  },
  emptyPendingText: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#64748b",
  },
  createPoSmallBtn: {
    marginTop: 8,
    padding: "6px 14px",
    borderRadius: 6,
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    textDecoration: "none",
  },
  pendingTable: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  pendingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
  },
  poNumber: {
    fontWeight: 700,
    color: "#0f172a",
  },
  poVendor: {
    color: "#475569",
  },
  poAmount: {
    fontWeight: 700,
    color: "#0f172a",
  },
  poStatus: {
    padding: "2px 8px",
    borderRadius: 4,
    backgroundColor: "#fef3c7",
    color: "#92400e",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  poViewBtn: {
    color: "#2563eb",
    fontWeight: 600,
    fontSize: "0.82rem",
    textDecoration: "none",
  },
  refreshBtn: {
    background: "none",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
  },
  customizeBanner: {
    marginTop: 40,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    border: "1px solid #bfdbfe",
    padding: "14px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customizeBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  bulbIcon: {
    fontSize: "1.2rem",
  },
  customizeText: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#1e40af",
  },
  customizeBtn: {
    padding: "6px 16px",
    borderRadius: 8,
    border: "1px solid #93c5fd",
    backgroundColor: "#ffffff",
    color: "#1d4ed8",
    fontSize: "0.82rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.6)",
    zIndex: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(2px)",
  },
  modalCardLarge: {
    width: 800,
    maxHeight: "85vh",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  modalTitle: {
    fontSize: "1.1rem",
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  },
  modalSub: {
    fontSize: "0.8rem",
    color: "#64748b",
    margin: "2px 0 0",
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    fontSize: "1.2rem",
    cursor: "pointer",
    color: "#64748b",
  },
  modalBodyScroll: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
  },
  closingTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thRow: {
    borderBottom: "1.5px solid #e2e8f0",
  },
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
  },
  td: {
    padding: "10px 12px",
    fontSize: "0.85rem",
    color: "#334155",
  },
  tdBold: {
    padding: "10px 12px",
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  qtyInput: {
    width: 100,
    padding: "6px 8px",
    borderRadius: 6,
    border: "1.5px solid #cbd5e1",
    fontSize: "0.85rem",
    fontWeight: 700,
  },
  fieldLabel: {
    display: "block",
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
  },
  textInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.85rem",
  },
  modalFooter: {
    padding: "16px 24px",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontWeight: 600,
    cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
};
