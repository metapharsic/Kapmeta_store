import React, { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

interface ItemAvailability {
  id: string; // menuItemId, used as the row key and for PATCH calls
  stockQty: number;
  isStocked: boolean;
  version: number;
  category: string;
  menuItem: {
    id: string;
    name: string;
    description: string;
    icon: string;
    priceFormatted: string;
    isVeg: boolean;
  };
}

interface AvailabilityApiRow {
  menuItemId: string;
  outletId: string;
  isStocked: boolean;
  stockQty: number;
  version: number;
  categoryName: string;
  name: string;
  priceMinor: string;
  isVeg: boolean;
}

interface RawIngredient {
  id: string;
  name: string;
  unitOfMeasure: string;
  reorderLevel: number;
  unitCost: number;
  currentStock: number;
}

interface RecipeIngredientRow {
  id: string;
  ingredientId: string;
  quantity: number;
  yieldPercent: number;
  ingredient: RawIngredient;
}

interface RecipeApi {
  id: string;
  menuItemId: string;
  version: number;
  isActive: boolean;
  recipeIngredients: RecipeIngredientRow[];
  menuItem?: {
    id: string;
    name: string;
    priceMinor: string;
    isVeg: boolean;
  };
}

interface VendorApi {
  id: string;
  name: string;
  phone: string;
  email?: string;
  taxNumber?: string;
}

interface PurchaseOrderApi {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  vendor: VendorApi;
  items: {
    id: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    ingredient: RawIngredient;
  }[];
}

function formatPriceMinor(priceMinor: string): string {
  const rupees = Number(BigInt(priceMinor)) / 100;
  return `₹${rupees.toFixed(2)}`;
}

function mapApiRow(row: AvailabilityApiRow): ItemAvailability {
  return {
    id: row.menuItemId,
    stockQty: row.stockQty,
    isStocked: row.isStocked,
    version: row.version,
    category: row.categoryName,
    menuItem: {
      id: row.menuItemId,
      name: row.name,
      description: "",
      icon: row.isVeg ? "🥗" : "🍗",
      priceFormatted: formatPriceMinor(row.priceMinor),
      isVeg: row.isVeg,
    },
  };
}

type TabType = "AVAILABILITY" | "INGREDIENTS" | "RECIPES" | "PROCUREMENT";

export default function InventoryDashboard() {
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const [activeTab, setActiveTab] = useState<TabType>("AVAILABILITY");

  // Availability State
  const [items, setItems] = useState<ItemAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Ingredients State
  const [ingredients, setIngredients] = useState<RawIngredient[]>([]);
  const [loadingIng, setLoadingIng] = useState(false);
  const [showAddIngModal, setShowAddIngModal] = useState(false);
  const [newIngName, setNewIngName] = useState("");
  const [newIngUom, setNewIngUom] = useState("g");
  const [newIngReorder, setNewIngReorder] = useState("500");
  const [newIngUnitCost, setNewIngUnitCost] = useState("10");

  // Recipes State
  const [recipes, setRecipes] = useState<RecipeApi[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [showAddRecipeModal, setShowAddRecipeModal] = useState(false);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [recipeLines, setRecipeLines] = useState<{ ingredientId: string; quantity: number; yieldPercent: number }[]>([
    { ingredientId: "", quantity: 100, yieldPercent: 100 },
  ]);

  // Vendors & PO State
  const [vendors, setVendors] = useState<VendorApi[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderApi[]>([]);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorPhone, setNewVendorPhone] = useState("");
  const [newVendorEmail, setNewVendorEmail] = useState("");

  const fetchAvailability = () => {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    authedFetch("/menu/availability", { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((data: AvailabilityApiRow[]) => {
        setItems(Array.isArray(data) ? data.map(mapApiRow) : []);
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setLoadError(err instanceof Error ? err.message : "Failed to load inventory");
        setItems([]);
        setLoading(false);
      });
  };

  const fetchIngredients = async () => {
    setLoadingIng(true);
    try {
      const res = await authedFetch("/ingredients");
      if (res.ok) {
        setIngredients(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIng(false);
    }
  };

  const fetchRecipes = async () => {
    setLoadingRec(true);
    try {
      const res = await authedFetch("/recipes");
      if (res.ok) {
        setRecipes(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRec(false);
    }
  };

  const fetchVendorsAndPOs = async () => {
    try {
      const [vRes, poRes] = await Promise.all([
        authedFetch("/vendors"),
        authedFetch("/purchase-orders"),
      ]);
      if (vRes.ok) setVendors(await vRes.json());
      if (poRes.ok) setPurchaseOrders(await poRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchAvailability();
    fetchIngredients();
    fetchRecipes();
    fetchVendorsAndPOs();
  }, [authLoading]);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const patchAvailability = async (id: string, isStocked: boolean, stockQty: number, expectedVersion: number) => {
    try {
      const res = await authedFetch(`/menu/items/${id}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStocked, stockQty, expectedVersion }),
      });

      if (res.status === 409) {
        fetchAvailability();
        return;
      }
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data: AvailabilityApiRow = await res.json();
      setItems((prev) =>
        prev.map((it) => (it.id === id ? mapApiRow(data) : it))
      );
    } catch {
      fetchAvailability();
    }
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;
    try {
      const res = await authedFetch("/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newIngName.trim(),
          unitOfMeasure: newIngUom,
          reorderLevel: parseFloat(newIngReorder) || 0,
          unitCost: parseFloat(newIngUnitCost) || 0,
        }),
      });
      if (res.ok) {
        setShowAddIngModal(false);
        setNewIngName("");
        fetchIngredients();
      }
    } catch (e) {
      alert("Failed to create ingredient");
    }
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenuItemId) {
      alert("Please select a dish/menu item");
      return;
    }
    const validLines = recipeLines.filter((l) => l.ingredientId && l.quantity > 0);
    if (validLines.length === 0) {
      alert("Please add at least one valid ingredient line");
      return;
    }
    try {
      const res = await authedFetch("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: selectedMenuItemId,
          ingredients: validLines,
        }),
      });
      if (res.ok) {
        setShowAddRecipeModal(false);
        fetchRecipes();
        alert("Recipe BOM linked successfully!");
      }
    } catch (e) {
      alert("Failed to link recipe BOM");
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim() || !newVendorPhone.trim()) return;
    try {
      const res = await authedFetch("/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVendorName.trim(),
          phone: newVendorPhone.trim(),
          email: newVendorEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowAddVendorModal(false);
        setNewVendorName("");
        setNewVendorPhone("");
        setNewVendorEmail("");
        fetchVendorsAndPOs();
      }
    } catch (e) {
      alert("Failed to create vendor");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.menuItem.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 font-sans">
      <Head>
        <title>Inventory & Supply Chain - PetPooja POS</title>
      </Head>
      <Nav variant="sidebar" />

      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-y-auto">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Inventory & Recipe BOM</h1>
            <p className="text-xs text-slate-400 mt-1">
              Automated Recipe Depletion, 86 Item Availability, Raw Materials & Procurement
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("AVAILABILITY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "AVAILABILITY" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📦 86 Availability
            </button>
            <button
              onClick={() => setActiveTab("INGREDIENTS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "INGREDIENTS" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🧂 Raw Ingredients ({ingredients.length})
            </button>
            <button
              onClick={() => setActiveTab("RECIPES")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "RECIPES" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📜 Recipe BOM ({recipes.length})
            </button>
            <button
              onClick={() => setActiveTab("PROCUREMENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "PROCUREMENT" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🚚 Vendors & POs ({vendors.length})
            </button>
          </div>
        </div>

        {/* TAB 1: AVAILABILITY & 86 LIST */}
        {activeTab === "AVAILABILITY" && (
          <div className="flex flex-col gap-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="text-slate-500 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search dishes to toggle 86 status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 flex-1 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      selectedCategory === cat ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Dishes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-slate-900 border rounded-xl p-4 flex flex-col justify-between transition ${
                    item.isStocked ? "border-slate-800" : "border-rose-900/40 bg-rose-950/10"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{item.menuItem.isVeg ? "🟢" : "🔴"}</span>
                        <h3 className="font-bold text-sm text-slate-100">{item.menuItem.name}</h3>
                      </div>
                      <span className="text-[10px] text-slate-400">{item.category} • {item.menuItem.priceFormatted}</span>
                    </div>

                    <button
                      onClick={() => patchAvailability(item.id, !item.isStocked, item.stockQty, item.version)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                        item.isStocked
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900"
                          : "bg-rose-950 text-rose-400 border border-rose-500/30 hover:bg-rose-900"
                      }`}
                    >
                      {item.isStocked ? "In Stock" : "86'd (Out)"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800 pt-3 mt-2">
                    <span className="text-xs text-slate-400">Available Portions:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => patchAvailability(item.id, item.isStocked, Math.max(0, item.stockQty - 1), item.version)}
                        className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold"
                      >
                        −
                      </button>
                      <span className="text-xs font-bold px-2">{item.stockQty}</span>
                      <button
                        onClick={() => patchAvailability(item.id, item.isStocked, item.stockQty + 1, item.version)}
                        className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: RAW INGREDIENTS */}
        {activeTab === "INGREDIENTS" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Raw Material Inventory</h2>
                <p className="text-[11px] text-slate-400">Track raw bulk items deducted via Recipe BOMs</p>
              </div>
              <button
                onClick={() => setShowAddIngModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>+</span> Add Raw Material
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Ingredient Name</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Unit Cost (₹)</th>
                    <th className="p-3">Reorder Threshold</th>
                    <th className="p-3">Current Stock</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {ingredients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No raw ingredients configured. Click "+ Add Raw Material" above.
                      </td>
                    </tr>
                  ) : (
                    ingredients.map((ing) => {
                      const isLow = ing.currentStock <= ing.reorderLevel;
                      return (
                        <tr key={ing.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-semibold text-slate-100">{ing.name}</td>
                          <td className="p-3">{ing.unitOfMeasure}</td>
                          <td className="p-3">₹{ing.unitCost.toFixed(2)}</td>
                          <td className="p-3">{ing.reorderLevel} {ing.unitOfMeasure}</td>
                          <td className="p-3 font-bold text-slate-100">{ing.currentStock} {ing.unitOfMeasure}</td>
                          <td className="p-3">
                            {isLow ? (
                              <span className="bg-amber-950 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                                ⚠️ Low Stock
                              </span>
                            ) : (
                              <span className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                                Healthy
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: RECIPE BOM */}
        {activeTab === "RECIPES" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Recipe Bill of Materials (BOM)</h2>
                <p className="text-[11px] text-slate-400">Map menu dishes to raw ingredients for automatic depletion on KOT firing</p>
              </div>
              <button
                onClick={() => setShowAddRecipeModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>+</span> Link Recipe to Dish
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.length === 0 ? (
                <div className="col-span-full bg-slate-900 border border-slate-800 p-8 rounded-xl text-center text-slate-500">
                  No recipes configured yet. Click "+ Link Recipe to Dish" to create your first recipe BOM.
                </div>
              ) : (
                recipes.map((rec) => (
                  <div key={rec.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                        <span className="font-bold text-sm text-slate-100">{rec.menuItem?.name || "Dish"}</span>
                        <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded font-bold">
                          BOM v{rec.version}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 mb-3">
                        {rec.recipeIngredients.map((ri) => (
                          <div key={ri.id} className="flex justify-between text-xs text-slate-300">
                            <span>{ri.ingredient?.name}</span>
                            <span className="font-bold text-indigo-400">
                              {ri.quantity} {ri.ingredient?.unitOfMeasure} ({ri.yieldPercent}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-500 flex justify-between">
                      <span>Status: Active</span>
                      <span className="text-emerald-400 font-bold">● Auto-depletes on KOT</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: VENDORS & PROCUREMENT */}
        {activeTab === "PROCUREMENT" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Vendors & Purchase Orders</h2>
                <p className="text-[11px] text-slate-400">Manage supplier directories and incoming stock goods</p>
              </div>
              <button
                onClick={() => setShowAddVendorModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>+</span> Add Vendor
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vendor List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">Active Suppliers</h3>
                <div className="flex flex-col gap-2">
                  {vendors.length === 0 ? (
                    <p className="text-xs text-slate-500">No suppliers registered.</p>
                  ) : (
                    vendors.map((v) => (
                      <div key={v.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-xs text-slate-200">{v.name}</div>
                          <div className="text-[11px] text-slate-400">{v.phone} {v.email ? `• ${v.email}` : ""}</div>
                        </div>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">Supplier</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Purchase Orders List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">Recent Purchase Orders</h3>
                <div className="flex flex-col gap-2">
                  {purchaseOrders.length === 0 ? (
                    <p className="text-xs text-slate-500">No purchase orders created yet.</p>
                  ) : (
                    purchaseOrders.map((po) => (
                      <div key={po.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-xs text-slate-200">{po.poNumber} — {po.vendor?.name}</div>
                          <div className="text-[11px] text-slate-400">Total: ₹{po.totalAmount} • {new Date(po.createdAt).toLocaleDateString()}</div>
                        </div>
                        <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-bold">
                          {po.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD RAW MATERIAL */}
      {showAddIngModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddIngModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-base text-slate-100 mb-4">Add Raw Material Ingredient</h2>
            <form onSubmit={handleCreateIngredient} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Ingredient Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice Batter, Pure Ghee, Paneer"
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Unit of Measure</label>
                  <select
                    value={newIngUom}
                    onChange={(e) => setNewIngUom(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                  >
                    <option value="g">Grams (g)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="L">Liters (L)</option>
                    <option value="pcs">Pieces (pcs)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Unit Cost (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newIngUnitCost}
                    onChange={(e) => setNewIngUnitCost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Reorder Alert Threshold</label>
                <input
                  type="number"
                  value={newIngReorder}
                  onChange={(e) => setNewIngReorder(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddIngModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold"
                >
                  Save Ingredient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LINK RECIPE BOM */}
      {showAddRecipeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddRecipeModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-base text-slate-100 mb-4">Link Recipe Bill of Materials (BOM)</h2>
            <form onSubmit={handleCreateRecipe} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Select Menu Dish</label>
                <select
                  required
                  value={selectedMenuItemId}
                  onChange={(e) => setSelectedMenuItemId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                >
                  <option value="">-- Choose Menu Dish --</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.menuItem.name} ({it.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Ingredients Breakdown</label>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {recipeLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <select
                        value={line.ingredientId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRecipeLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ingredientId: val } : l)));
                        }}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="">-- Select Raw Item --</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unitOfMeasure})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setRecipeLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l)));
                        }}
                        className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                      />

                      <button
                        type="button"
                        onClick={() => setRecipeLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-rose-400 hover:text-rose-300 px-1 font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRecipeLines((prev) => [...prev, { ingredientId: "", quantity: 10, yieldPercent: 100 }])}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold mt-2 inline-block"
                >
                  + Add Ingredient Line
                </button>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddRecipeModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold"
                >
                  Save Recipe BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD VENDOR */}
      {showAddVendorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddVendorModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-base text-slate-100 mb-4">Register Supplier / Vendor</h2>
            <form onSubmit={handleCreateVendor} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Supplier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sri Lakshmi Dairy, Metro Cash & Carry"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +91 9876543210"
                  value={newVendorPhone}
                  onChange={(e) => setNewVendorPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="vendor@supplies.com"
                  value={newVendorEmail}
                  onChange={(e) => setNewVendorEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold"
                >
                  Register Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
