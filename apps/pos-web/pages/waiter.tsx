import React, { useState, useEffect, useMemo, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard, logout } from "../lib/auth";
import { useKapmetaSocket } from "../lib/useKapmetaSocket";
import CaptainNavDrawer from "../components/CaptainNavDrawer";
import UnsuccessfulKotModal from "../components/UnsuccessfulKotModal";
import LanServerDiscoveryModal from "../components/LanServerDiscoveryModal";
import CaptainPinLoginModal from "../components/CaptainPinLoginModal";
import WaiterCashTipsCalculator from "../components/WaiterCashTipsCalculator";
import MoveKotModal from "../components/MoveKotModal";
import AttractiveMenuItemCard, { MenuItemData } from "../components/menu/AttractiveMenuItemCard";
import MenuCustomizerModal, { CustomizedItemSelection } from "../components/menu/MenuCustomizerModal";
import { DietaryFilter } from "../components/menu/CategoryNavbar";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  priceMinor: number;
  isVeg: boolean;
  isStocked: boolean;
  stockQty: number;
  icon: string;
}

interface RawMenuItemApi extends Omit<MenuItem, "isStocked" | "stockQty" | "category"> {
  categoryName: string;
  availability: { isStocked: boolean; stockQty: number; version: number } | null;
}

interface DiningTable {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: "VACANT" | "OCCUPIED" | "BILLING" | "DIRTY";
  isActive: boolean;
  kitchenStage?: "QUEUED" | "COOKING" | "READY" | "SERVED" | null;
  orderStatus?: string | null;
  currentOrderId?: string | null;
  mergeGroupId?: string | null;
  mergePrimaryTableId?: string | null;
  mergedWith?: string[];
  isMergePrimary?: boolean;
  currentOrder?: {
    id: string;
    kots?: { id: string; ticketNumber: string; status: string }[];
  } | null;
}

type Course = "STARTER" | "MAIN" | "DESSERT" | "BEVERAGE";
const COURSES: Course[] = ["STARTER", "MAIN", "DESSERT", "BEVERAGE"];

interface CartItem {
  item: MenuItem;
  quantity: number;
  notes: string;
  course: Course;
  seatNumber?: number | null;
}

interface KOTTicket {
  id: string;
  ticketNumber: string;
  status: "QUEUED" | "PREPARING" | "READY" | "SERVED";
  createdAt: string;
  tableNumber?: string | null;
  kotItems: {
    id: string;
    quantity: number;
    notes: string | null;
    course: Course | null;
    menuItem: { name: string };
  }[];
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  grandTotalMinor: string;
  items: {
    id: string;
    menuItemId: string;
    menuItemName: string;
    quantity: number;
    unitPriceMinor: string;
    subtotalMinor: string;
    notes: string | null;
    isVoided: boolean;
    course: string | null;
    seatNumber: number | null;
    kitchenStatus?: string | null;
  }[];
}

interface BillData {
  orderId: string;
  orderNumber: string;
  subtotalMinor: string;
  discountTotalMinor: string;
  taxTotalMinor: string;
  tipTotalMinor: string;
  serviceChargeTotalMinor: string;
  grandTotalMinor: string;
  paidMinor: string;
  dueMinor: string;
}

interface SeatBillData {
  seatNumber: number | null;
  subtotalMinor: string;
  paidMinor: string;
}

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: any;
}

function kitchenItemLabel(status?: string | null): string {
  if (status === "SERVED") return "Served";
  if (status === "READY") return "Ready";
  if (status === "PREPARING" || status === "COOKING" || status === "IN_PREPARATION") return "Cooking";
  if (status === "QUEUED" || status === "KOT_CREATED" || status === "PENDING") return "In kitchen";
  return "Ticketed";
}

const OFFLINE_QUEUE_KEY = "kapmeta_waiter_offline_queue";

function loadOfflineQueue(): QueuedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: QueuedRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function syncOfflineQueue() {
  if (typeof window === "undefined") return;
  const queue = loadOfflineQueue();
  if (queue.length === 0) return;
  const remaining: QueuedRequest[] = [];
  for (const item of queue) {
    try {
      const res = await authedFetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
}

// ----------------------------------------------------
// Web Audio API: Native synthesised bell chime for KOT pickup
// ----------------------------------------------------
function playPickupBeep() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Play a two-tone chime (880Hz -> 1760Hz bell sequence)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15); // E6
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.7);
  } catch (e) {
    console.error("Failed to play audio alert", e);
  }
}

const ORDER_CATEGORIES = [
  "Breakfast",
  "Meal Box (Online)",
  "Cold Beverage",
  "Hot Beverages",
  "Soup(Veg)",
  "Meals",
  "Soup(Non-Veg)",
  "Chinese Starters (Veg)",
  "Chinese Starters (Non-Veg)",
  "Tandoori Starters (Veg)",
  "Tandoori Starters (Non-Veg)",
  "Curries (Veg)",
  "Curries (Non-Veg)",
  "Roti",
  "Noodles (Veg)",
];

const DEFAULT_WAITER_TABLES: DiningTable[] = [
  // AC Section
  { id: "tbl_a1", tableNumber: "A1", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a2", tableNumber: "A2", capacity: 2, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a3", tableNumber: "A3", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a4", tableNumber: "A4", capacity: 6, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a5", tableNumber: "A5", capacity: 2, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a6", tableNumber: "A6", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a7", tableNumber: "A7", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a8", tableNumber: "A8", capacity: 2, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a9", tableNumber: "A9", capacity: 6, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a10", tableNumber: "A10", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a11", tableNumber: "A11", capacity: 2, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a12", tableNumber: "A12", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a13", tableNumber: "A13", capacity: 4, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a14", tableNumber: "A14", capacity: 6, section: "AC", status: "VACANT", isActive: true },
  { id: "tbl_a15", tableNumber: "A15", capacity: 2, section: "AC", status: "VACANT", isActive: true },
  // Non-AC Section
  { id: "tbl_b1", tableNumber: "B1", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b2", tableNumber: "B2", capacity: 2, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b3", tableNumber: "B3", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b4", tableNumber: "B4", capacity: 6, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b5", tableNumber: "B5", capacity: 2, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b6", tableNumber: "B6", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b7", tableNumber: "B7", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b8", tableNumber: "B8", capacity: 2, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b9", tableNumber: "B9", capacity: 6, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b10", tableNumber: "B10", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b11", tableNumber: "B11", capacity: 2, section: "Non-AC", status: "VACANT", isActive: true },
  { id: "tbl_b12", tableNumber: "B12", capacity: 4, section: "Non-AC", status: "VACANT", isActive: true },
];

// Offline/network-failure fallback ONLY — used when /menu/items cannot be reached.
// This is NOT the happy-path default; the captain tablet always fetches live menu
// data from the API on mount (see fetchMenu below).
const OFFLINE_FALLBACK_MENU_ITEMS: MenuItem[] = [
  // Breakfast Items (Exact Match)
  { id: "bk_1", name: "(2) Idly (1) Vada", category: "Breakfast", description: "Fresh steamed idlies with crispy medu vada & piping hot sambar", priceMinor: 7000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_2", name: "(S) Idly", category: "Breakfast", description: "Single steamed soft idly served with coconut chutney", priceMinor: 4000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_3", name: "(S) Idly (S) Vada", category: "Breakfast", description: "Single idly and single vada combo", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_4", name: "(S) Idly (S) Vada Sambar", category: "Breakfast", description: "Idly & vada dipped in aromatic south Indian sambar", priceMinor: 6500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "bk_5", name: "(S) Idly Sambar", category: "Breakfast", description: "Single idly dipped in hot sambar", priceMinor: 4500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "bk_6", name: "(S) Vada", category: "Breakfast", description: "Single crisp golden brown medu vada", priceMinor: 4500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍩" },
  { id: "bk_7", name: "(S) Vada Sambar", category: "Breakfast", description: "Single crisp vada submerged in flavourful sambar", priceMinor: 5000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "bk_8", name: "70 Mm Dosa", category: "Breakfast", description: "Extra-long jumbo crisp dosa served with 3 chutneys", priceMinor: 11000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_9", name: "Butter Masala Dosa", category: "Breakfast", description: "Crisp golden crepe smeared with Amul butter & potato masala", priceMinor: 9500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_10", name: "Chitti Pesarattu", category: "Breakfast", description: "Mini green gram crepes loaded with chopped onions & ginger", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_11", name: "Extra Aloo", category: "Breakfast", description: "Portion of spicy spiced potato stuffing", priceMinor: 2500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥔" },
  { id: "bk_12", name: "Extra Poori", category: "Breakfast", description: "Single freshly puffed golden poori", priceMinor: 3000, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "bk_13", name: "Ghee Karam Idly", category: "Breakfast", description: "Bite-sized button idlies tossed in spicy Guntur podi and pure ghee", priceMinor: 7500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_14", name: "Ghee Karvepaaku Podi Dosa", category: "Breakfast", description: "Curry leaf podi sprinkled dosa with generous desi ghee", priceMinor: 10500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_15", name: "Ghee Podi Dosa", category: "Breakfast", description: "Crispy dosa layered with spicy gun-powder and clarified butter", priceMinor: 9500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_16", name: "Ghee Podi Rava Dosa", category: "Breakfast", description: "Semolina net dosa roasted crisp with podi and ghee", priceMinor: 11500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_17", name: "Idly (2)", category: "Breakfast", description: "Pair of steamed rice cakes served with sambar & chutney", priceMinor: 5000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_18", name: "Idly Sambar", category: "Breakfast", description: "2 steamed idlies floating in fresh piping hot sambar", priceMinor: 5500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "bk_19", name: "Masala Dosa", category: "Breakfast", description: "Classic Bengaluru style crispy dosa stuffed with potato bhaji", priceMinor: 8000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_20", name: "Onion Dosa", category: "Breakfast", description: "Crispy dosa topped with caramelised chopped onions", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_21", name: "Onion Rava Dosa", category: "Breakfast", description: "Semolina lace crepe loaded with crushed onions & cumin", priceMinor: 10000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_22", name: "Onion Uttapam", category: "Breakfast", description: "Thick spongy rice pancake studded with juicy onions and chillies", priceMinor: 9000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_23", name: "Paneer Dosa", category: "Breakfast", description: "Thin crepe loaded with shredded seasoned cottage cheese", priceMinor: 11000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_24", name: "Paper Dosa", category: "Breakfast", description: "Wafer-thin ultra-crisp golden roast dosa", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_25", name: "Pesarattu", category: "Breakfast", description: "Whole moong dal savoury crepe served with ginger allam pachadi", priceMinor: 7500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_26", name: "Plain Dosa", category: "Breakfast", description: "Traditional fermented rice-lentil golden roasted crepe", priceMinor: 6500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_27", name: "Poori", category: "Breakfast", description: "3 fluffy deep-fried wheat breads served with potato sagu", priceMinor: 7000, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "bk_28", name: "Rava Dosa", category: "Breakfast", description: "Crisp instant semolina crepe roasted with green chillies & ginger", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_29", name: "Set Dosa", category: "Breakfast", description: "3 soft, spongy and fluffy dosas with sagu and coconut chutney", priceMinor: 8000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥞" },
  { id: "bk_30", name: "Thatte Idly", category: "Breakfast", description: "Famous Karnataka flat plate idly served with red chilli chutney & ghee", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥟" },
  { id: "bk_31", name: "Vada", category: "Breakfast", description: "2 crispy savoury lentil fritters with aromatic curry leaves", priceMinor: 5000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍩" },
  { id: "bk_32", name: "Vada Sambar", category: "Breakfast", description: "Pair of medu vadas steeped in authentic drumstick sambar", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },

  // Meal Box (Online)
  { id: "mb_1", name: "South Indian Executive Meal Box", category: "Meal Box (Online)", description: "Rice, Sambar, Rasam, 2 Poriyals, Curd, Sweet, Papad & Pickle", priceMinor: 19900, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },
  { id: "mb_2", name: "North Indian Mini Meal Box", category: "Meal Box (Online)", description: "2 Butter Rotis, Paneer Butter Masala, Dal Tadka, Jeera Rice, Gulab Jamun", priceMinor: 18900, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },
  { id: "mb_3", name: "Special Biryani Box (Veg)", category: "Meal Box (Online)", description: "Hyderabadi Veg Dum Biryani, Mirchi Ka Salan, Raita, Sweet", priceMinor: 22000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },
  { id: "mb_4", name: "Chicken Biryani Combo Box", category: "Meal Box (Online)", description: "Chicken Biryani, Chicken 65 (2 pcs), Salan, Raita, Boondi Ladoo", priceMinor: 26000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍱" },
  { id: "mb_5", name: "Paneer Tikka Meal Box", category: "Meal Box (Online)", description: "Paneer Tikka, Butter Naan, Dal Makhani, Pulao, Dessert", priceMinor: 24000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },
  { id: "mb_6", name: "Chinese Combo Meal Box", category: "Meal Box (Online)", description: "Veg Hakka Noodles, Veg Manchurian Gravy, Spring Roll", priceMinor: 23000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },

  // Cold Beverage
  { id: "cb_1", name: "Fresh Sweet Lime Soda", category: "Cold Beverage", description: "Bubbly and refreshing fresh squeezed lime soda", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥤" },
  { id: "cb_2", name: "Cold Coffee with Ice Cream", category: "Cold Beverage", description: "Rich chilled espresso topped with vanilla ice cream", priceMinor: 9000, isVeg: true, isStocked: true, stockQty: 100, icon: "🧋" },
  { id: "cb_3", name: "Watermelon Juice", category: "Cold Beverage", description: "100% natural freshly cold-pressed watermelon juice", priceMinor: 7000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍉" },
  { id: "cb_4", name: "Mango Lassi", category: "Cold Beverage", description: "Creamy Alphonso mango pulp blended with rich fresh yoghurt", priceMinor: 8000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥭" },
  { id: "cb_5", name: "Butter Milk (Masala Chaas)", category: "Cold Beverage", description: "Cooling spiced buttermilk with ginger, green chilli and coriander", priceMinor: 4000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥛" },
  { id: "cb_6", name: "Fresh Mint Lemonade", category: "Cold Beverage", description: "Chilled zesty lemonade infused with crushed garden mint", priceMinor: 5000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍋" },
  { id: "cb_7", name: "Kesar Badam Thandai", category: "Cold Beverage", description: "Traditional royal saffron and almond infused cold milk", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥛" },
  { id: "cb_8", name: "Oreo Chocolate Shake", category: "Cold Beverage", description: "Thick creamy shake blended with crushed Oreo cookies", priceMinor: 9500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥤" },

  // Hot Beverages
  { id: "hb_1", name: "South Indian Filter Coffee", category: "Hot Beverages", description: "Authentic chicory filter coffee frothed in traditional dabarah", priceMinor: 4000, isVeg: true, isStocked: true, stockQty: 100, icon: "☕" },
  { id: "hb_2", name: "Special Masala Chai", category: "Hot Beverages", description: "Strong freshly brewed tea simmered with cardamom and ginger", priceMinor: 3500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍵" },
  { id: "hb_3", name: "Ginger Lemon Green Tea", category: "Hot Beverages", description: "Organic detox green tea infused with fresh ginger & lemon", priceMinor: 4500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫖" },
  { id: "hb_4", name: "Hot Badam Milk", category: "Hot Beverages", description: "Steaming hot milk infused with crushed roasted almonds & saffron", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥛" },
  { id: "hb_5", name: "Cardamom Irani Chai", category: "Hot Beverages", description: "Slow-cooked dum brewed rich and creamy Hyderabad Irani chai", priceMinor: 4000, isVeg: true, isStocked: true, stockQty: 100, icon: "☕" },
  { id: "hb_6", name: "Hot Chocolate", category: "Hot Beverages", description: "Rich Belgian hot chocolate with velvety steamed milk", priceMinor: 7000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍫" },

  // Soup (Veg)
  { id: "sv_1", name: "Cream of Tomato Soup", category: "Soup(Veg)", description: "Velvety ripe tomato soup served with crunchy croutons", priceMinor: 8000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "sv_2", name: "Veg Hot and Sour Soup", category: "Soup(Veg)", description: "Spicy & tangy Asian soup packed with shredded veggies & mushrooms", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "sv_3", name: "Sweet Corn Veg Soup", category: "Soup(Veg)", description: "Comforting creamy broth with tender sweet corn kernels", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🌽" },
  { id: "sv_4", name: "Veg Manchow Soup", category: "Soup(Veg)", description: "Indo-Chinese garlicky soup topped with crispy fried noodles", priceMinor: 9000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "sv_5", name: "Lemon Coriander Veg Soup", category: "Soup(Veg)", description: "Zesty clear vegetable broth infused with fresh lemon and coriander", priceMinor: 8500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "sv_6", name: "Cream of Mushroom Soup", category: "Soup(Veg)", description: "Rich roasted button mushroom soup simmered in fresh cream", priceMinor: 9500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍄" },

  // Meals
  { id: "m_1", name: "Kapila Special Veg Thali", category: "Meals", description: "2 Roti, Paneer Curry, Dal, Veg Fry, Rice, Sambar, Rasam, Curd, Sweet", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍛" },
  { id: "m_2", name: "South Indian Full Meals", category: "Meals", description: "Unlimited hot rice, Ghee, Gunpowder, Sambar, Rasam, 2 Curries, Payasam", priceMinor: 14000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍛" },
  { id: "m_3", name: "Curd Rice with Pomegranate", category: "Meals", description: "Creamy seasoned curd rice tempered with mustard seeds and pearls", priceMinor: 8000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍚" },
  { id: "m_4", name: "Sambar Rice with Ghee", category: "Meals", description: "Classic hot Bisi Bele Bath style sambar rice drenched in desi ghee", priceMinor: 9000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍛" },
  { id: "m_5", name: "Andhra Special Meals", category: "Meals", description: "Fiery Andhra Pappu, Gongura pachadi, Royyala iguru gravy & Curd", priceMinor: 17000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍛" },
  { id: "m_6", name: "Mini Executive Lunch", category: "Meals", description: "Quick balanced meal with roti, dal, pulao, raita and salad", priceMinor: 12000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍱" },

  // Soup (Non-Veg)
  { id: "snv_1", name: "Chicken Manchow Soup", category: "Soup(Non-Veg)", description: "Spicy shredded chicken soup crowned with crisp noodles", priceMinor: 11000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "snv_2", name: "Chicken Sweet Corn Soup", category: "Soup(Non-Veg)", description: "Gentle chicken broth with sweet corn and egg ribbons", priceMinor: 11000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "snv_3", name: "Mutton Bone Marrow Soup (Paya)", category: "Soup(Non-Veg)", description: "Traditional slow-simmered aromatic paya shorba broth", priceMinor: 15000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍖" },
  { id: "snv_4", name: "Chicken Hot & Sour Soup", category: "Soup(Non-Veg)", description: "Bold chicken soup seasoned with dark soya, vinegar and pepper", priceMinor: 11500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "snv_5", name: "Chicken Clear Soup", category: "Soup(Non-Veg)", description: "Nourishing clear broth with chicken chunks and spring onions", priceMinor: 10500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "snv_6", name: "Mutton Shorba (Special)", category: "Soup(Non-Veg)", description: "Royal Nizami mutton bone broth flavored with cloves & cardamom", priceMinor: 16000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍖" },

  // Chinese Starters (Veg)
  { id: "csv_1", name: "Veg Manchurian Dry", category: "Chinese Starters (Veg)", description: "Crisp vegetable dumplings wok-tossed in ginger garlic glaze", priceMinor: 13000, isVeg: true, isStocked: true, stockQty: 100, icon: "🧆" },
  { id: "csv_2", name: "Chilli Paneer Dry", category: "Chinese Starters (Veg)", description: "Cottage cheese cubes wok-fried with bell peppers and green chillies", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🧀" },
  { id: "csv_3", name: "Crispy Corn Pepper Salt", category: "Chinese Starters (Veg)", description: "Golden fried sweet corn kernels tossed with freshly ground pepper", priceMinor: 14000, isVeg: true, isStocked: true, stockQty: 100, icon: "🌽" },
  { id: "csv_4", name: "Baby Corn 65", category: "Chinese Starters (Veg)", description: "Crunchy baby corn florets coated in spiced southern masala", priceMinor: 14500, isVeg: true, isStocked: true, stockQty: 100, icon: "🌽" },
  { id: "csv_5", name: "Veg Spring Rolls (6 Pcs)", category: "Chinese Starters (Veg)", description: "Golden crispy pastry rolls stuffed with shredded vegetables", priceMinor: 13500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥢" },
  { id: "csv_6", name: "Paneer 65 Crispy", category: "Chinese Starters (Veg)", description: "Paneer cubes marinated in yogurt chili paste and curry leaves", priceMinor: 16500, isVeg: true, isStocked: true, stockQty: 100, icon: "🧀" },
  { id: "csv_7", name: "Mushroom Chilli Dry", category: "Chinese Starters (Veg)", description: "Fresh button mushrooms tossed with green chillies & spring onions", priceMinor: 15000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍄" },
  { id: "csv_8", name: "Honey Chilli Potato", category: "Chinese Starters (Veg)", description: "Crispy potato fingers glazed in sweet honey and hot chilli paste", priceMinor: 12500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍟" },

  // Chinese Starters (Non-Veg)
  { id: "csnv_1", name: "Chilli Chicken Dry", category: "Chinese Starters (Non-Veg)", description: "Boneless chicken tossed with onions, green chillies and soya sauce", priceMinor: 18000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "csnv_2", name: "Chicken 65 Hyderabadi", category: "Chinese Starters (Non-Veg)", description: "Crispy spicy chicken chunks tempered with curry leaves and mustard", priceMinor: 19000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "csnv_3", name: "Apollo Fish Fry", category: "Chinese Starters (Non-Veg)", description: "Boneless fish fillets marinated in spiced curd and pan tossed", priceMinor: 22000, isVeg: false, isStocked: true, stockQty: 100, icon: "🐟" },
  { id: "csnv_4", name: "Dragon Chicken", category: "Chinese Starters (Non-Veg)", description: "Crispy chicken strips tossed in fiery red dragon sauce with cashews", priceMinor: 19500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "csnv_5", name: "Chicken Lollipop (6 Pcs)", category: "Chinese Starters (Non-Veg)", description: "Crisp frenched chicken winglets served with spicy Szechuan dip", priceMinor: 21000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "csnv_6", name: "Pepper Chicken Roast", category: "Chinese Starters (Non-Veg)", description: "Dry chicken roast seasoned with roasted black peppercorns", priceMinor: 19500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "csnv_7", name: "Garlic Butter Prawns", category: "Chinese Starters (Non-Veg)", description: "Juicy ocean prawns sautéed in rich garlic butter glaze", priceMinor: 25000, isVeg: false, isStocked: true, stockQty: 100, icon: "🦐" },
  { id: "csnv_8", name: "Chicken Majestic", category: "Chinese Starters (Non-Veg)", description: "Tender chicken strips tossed with green chillies and mint yogurt", priceMinor: 20000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },

  // Tandoori Starters (Veg)
  { id: "tsv_1", name: "Paneer Tikka Angara", category: "Tandoori Starters (Veg)", description: "Smoky cottage cheese cubes charred in clay tandoor oven", priceMinor: 18000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsv_2", name: "Malai Broccoli Tikka", category: "Tandoori Starters (Veg)", description: "Tender broccoli florets marinated in cream, cheese and cardamom", priceMinor: 19000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥦" },
  { id: "tsv_3", name: "Tandoori Mushroom Tikka", category: "Tandoori Starters (Veg)", description: "Button mushrooms filled with spiced paneer and roasted over coals", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsv_4", name: "Veg Seekh Kabab", category: "Tandoori Starters (Veg)", description: "Minced vegetable and corn skewers spiced and charcoal grilled", priceMinor: 15000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsv_5", name: "Haryali Paneer Tikka", category: "Tandoori Starters (Veg)", description: "Paneer cubes infused with fresh mint, spinach and coriander paste", priceMinor: 18500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsv_6", name: "Tandoori Stuffed Aloo", category: "Tandoori Starters (Veg)", description: "Scooped potatoes stuffed with dry fruits and roasted golden", priceMinor: 14000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥔" },

  // Tandoori Starters (Non-Veg)
  { id: "tsnv_1", name: "Tandoori Murgh (Full)", category: "Tandoori Starters (Non-Veg)", description: "Whole chicken marinated in Kashmiri chili yogurt & tandoor grilled", priceMinor: 34000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "tsnv_2", name: "Murgh Tikka (6 Pcs)", category: "Tandoori Starters (Non-Veg)", description: "Succulent boneless chicken chunks roasted on iron skewers", priceMinor: 21000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsnv_3", name: "Tangdi Kabab (4 Pcs)", category: "Tandoori Starters (Non-Veg)", description: "Chicken drumsticks marinated in rich cheese cream and roasted", priceMinor: 23000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },
  { id: "tsnv_4", name: "Reshmi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", description: "Silky soft chicken breast chunks marinated in cashew cream", priceMinor: 22000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsnv_5", name: "Mutton Seekh Kabab", category: "Tandoori Starters (Non-Veg)", description: "Spiced minced mutton cylinders grilled over hot glowing coals", priceMinor: 26000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsnv_6", name: "Fish Tikka (Tandoori)", category: "Tandoori Starters (Non-Veg)", description: "Ajwain spiced river fish fillets roasted to flaky perfection", priceMinor: 24000, isVeg: false, isStocked: true, stockQty: 100, icon: "🐟" },
  { id: "tsnv_7", name: "Pahadi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", description: "Chicken chunks coated in rustic Himalayan green herb marinade", priceMinor: 21500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍢" },
  { id: "tsnv_8", name: "Kalmi Kabab (3 Pcs)", category: "Tandoori Starters (Non-Veg)", description: "Mughlai style marinated chicken thighs cooked over slow fire", priceMinor: 23500, isVeg: false, isStocked: true, stockQty: 100, icon: "🍗" },

  // Curries (Veg)
  { id: "cv_1", name: "Paneer Butter Masala", category: "Curries (Veg)", description: "Soft paneer cubes simmered in velvety tomato cashew makhani gravy", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },
  { id: "cv_2", name: "Kaju Curry (Special)", category: "Curries (Veg)", description: "Whole roasted cashews cooked in rich onion-tomato aromatic gravy", priceMinor: 20000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },
  { id: "cv_3", name: "Dal Tadka Desi Ghee", category: "Curries (Veg)", description: "Yellow lentils tempered with cumin, garlic, dry red chillies and ghee", priceMinor: 12000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "cv_4", name: "Methi Chaman", category: "Curries (Veg)", description: "Kashmiri cottage cheese delicacy cooked with fresh fenugreek leaves", priceMinor: 17000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },
  { id: "cv_5", name: "Kadai Paneer", category: "Curries (Veg)", description: "Cottage cheese and crunchy bell peppers tossed in pounded spices", priceMinor: 16500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },
  { id: "cv_6", name: "Dal Makhani (Slow Cooked)", category: "Curries (Veg)", description: "Black urad lentils and kidney beans simmered overnight with butter", priceMinor: 15000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥣" },
  { id: "cv_7", name: "Mix Veg Curry", category: "Curries (Veg)", description: "Seasonal garden vegetables cooked in mild North Indian gravy", priceMinor: 13500, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },
  { id: "cv_8", name: "Palak Paneer", category: "Curries (Veg)", description: "Paneer cubes steeped in velvety garlic-tempered spinach gravy", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🥘" },

  // Curries (Non-Veg)
  { id: "cnv_1", name: "Butter Chicken Delhi Style", category: "Curries (Non-Veg)", description: "Tandoori chicken pieces simmered in silky buttery tomato gravy", priceMinor: 22000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_2", name: "Telangana Style Chicken Curry", category: "Curries (Non-Veg)", description: "Rustic country style chicken curry with roasted spices & poppy seeds", priceMinor: 21000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_3", name: "Mutton Rogan Josh", category: "Curries (Non-Veg)", description: "Classic Kashmiri tender mutton braised in aromatic ratanjot gravy", priceMinor: 28000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_4", name: "Chicken Tikka Masala", category: "Curries (Non-Veg)", description: "Charcoal grilled chicken tikka in spiced onion-tomato masala", priceMinor: 23000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_5", name: "Chettinad Chicken Curry", category: "Curries (Non-Veg)", description: "Fiery Tamil style chicken with roasted black peppercorns and coconut", priceMinor: 22000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_6", name: "Andhra Mutton Curry", category: "Curries (Non-Veg)", description: "Spicy tender goat meat curry slow cooked with green chili paste", priceMinor: 29000, isVeg: false, isStocked: true, stockQty: 100, icon: "🍲" },
  { id: "cnv_7", name: "Nellore Fish Curry", category: "Curries (Non-Veg)", description: "Tangy raw mango and tamarind fish curry cooked in earthen pot", priceMinor: 24000, isVeg: false, isStocked: true, stockQty: 100, icon: "🐟" },
  { id: "cnv_8", name: "Egg Masala Curry (2 Eggs)", category: "Curries (Non-Veg)", description: "Boiled fried eggs in thick seasoned onion tomato gravy", priceMinor: 14000, isVeg: false, isStocked: true, stockQty: 100, icon: "🥚" },

  // Roti
  { id: "r_1", name: "Butter Naan", category: "Roti", description: "Leavened oven-baked flatbread brushed with butter", priceMinor: 4500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_2", name: "Garlic Butter Naan", category: "Roti", description: "Crisp naan topped with minced roasted garlic & fresh coriander", priceMinor: 5500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_3", name: "Tandoori Roti (Butter)", category: "Roti", description: "Whole wheat round flatbread cooked crisp in clay tandoor", priceMinor: 3000, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_4", name: "Rumali Roti", category: "Roti", description: "Ultra thin handkerchief style soft Indian flatbread", priceMinor: 3500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_5", name: "Plain Tandoori Roti", category: "Roti", description: "Healthy whole wheat bread baked in clay tandoor", priceMinor: 2500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_6", name: "Laccha Paratha", category: "Roti", description: "Multi-layered flaky whole wheat paratha roasted with ghee", priceMinor: 5000, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_7", name: "Amritsari Kulcha", category: "Roti", description: "Crispy tandoori kulcha stuffed with spiced mashed potatoes", priceMinor: 6000, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },
  { id: "r_8", name: "Cheese Garlic Naan", category: "Roti", description: "Naan stuffed with melting mozzarella cheese and garlic", priceMinor: 7500, isVeg: true, isStocked: true, stockQty: 100, icon: "🫓" },

  // Noodles (Veg)
  { id: "nv_1", name: "Veg Hakka Noodles", category: "Noodles (Veg)", description: "Wok tossed noodles with shredded cabbage, carrots & bell peppers", priceMinor: 14000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
  { id: "nv_2", name: "Veg Schezwan Noodles", category: "Noodles (Veg)", description: "Spicy wok noodles tossed with fiery red Schezwan pepper sauce", priceMinor: 15000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
  { id: "nv_3", name: "Chilli Garlic Veg Noodles", category: "Noodles (Veg)", description: "Noodles tossed with roasted garlic, red chillies and spring onion", priceMinor: 15500, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
  { id: "nv_4", name: "Singapore Veg Noodles", category: "Noodles (Veg)", description: "Thin vermicelli noodles seasoned with mild yellow curry powder", priceMinor: 16000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
  { id: "nv_5", name: "Burnt Garlic Veg Noodles", category: "Noodles (Veg)", description: "Aromatic noodles loaded with golden browned garlic and soy", priceMinor: 15000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
  { id: "nv_6", name: "Paneer Hakka Noodles", category: "Noodles (Veg)", description: "Hakka noodles loaded with spiced paneer cubes and crunchy veggies", priceMinor: 17000, isVeg: true, isStocked: true, stockQty: 100, icon: "🍜" },
];

export default function WaiterDashboard() {
  const { me, loading: authLoading } = useAuthGuard("order.create");

  // Floor Map & Catalog States
  const [tables, setTables] = useState<DiningTable[]>(DEFAULT_WAITER_TABLES);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState<boolean>(true);
  const [categories, setCategories] = useState<string[]>(ORDER_CATEGORIES);
  const [myKots, setMyKots] = useState<KOTTicket[]>([]);
  const kotFetchGen = useRef(0);
  const [selectedSection, setSelectedSection] = useState<string>("All");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Active Order Building State
  const [activeTable, setActiveTable] = useState<DiningTable | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [coversCount, setCoversCount] = useState<number>(2);
  const [selectedCourse, setSelectedCourse] = useState<Course>("STARTER");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter>("ALL");
  const [menuViewMode, setMenuViewMode] = useState<"tile" | "compact">("tile");
  const [customizingItem, setCustomizingItem] = useState<MenuItemData | null>(null);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);

  // Manage existing occupied table order (add items / void)
  const [manageOrder, setManageOrder] = useState<OrderDetail | null>(null);
  const [loadingManageOrder, setLoadingManageOrder] = useState(false);
  const manageOrderRef = useRef<OrderDetail | null>(null);
  const activeTableRef = useRef<DiningTable | null>(null);
  manageOrderRef.current = manageOrder;
  activeTableRef.current = activeTable;

  // Table Transfer & Merge states
  const [transferFromTable, setTransferFromTable] = useState<DiningTable | null>(null);
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [mergeMode, setMergeMode] = useState(false);
  const [tableActionError, setTableActionError] = useState<string | null>(null);

  // Bill & Pay modal states
  const [billTable, setBillTable] = useState<DiningTable | null>(null);
  const [bill, setBill] = useState<BillData | null>(null);
  const [loadingBill, setLoadingBill] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [tipInput, setTipInput] = useState<string>("");
  const [serviceChargeInput, setServiceChargeInput] = useState<string>("");
  const [savingCharges, setSavingCharges] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [seatBills, setSeatBills] = useState<SeatBillData[]>([]);
  const [splitBySeat, setSplitBySeat] = useState(false);

  // Captain Drawer & Modals
  const [isCaptainDrawerOpen, setIsCaptainDrawerOpen] = useState<boolean>(false);
  const [isUnsuccessfulModalOpen, setIsUnsuccessfulModalOpen] = useState<boolean>(false);
  const [isServerIpModalOpen, setIsServerIpModalOpen] = useState<boolean>(false);
  const [isPinLoginModalOpen, setIsPinLoginModalOpen] = useState<boolean>(false);
  const [isCashTipsCalculatorOpen, setIsCashTipsCalculatorOpen] = useState<boolean>(false);

  // Connectivity & Feedback
  const [mounted, setMounted] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [offlineQueue, setOfflineQueue] = useState<QueuedRequest[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(true);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Waiter Personal Shift Stats
  const [showStats, setShowStats] = useState<boolean>(false);
  const [myStats, setMyStats] = useState<{
    ordersToday: number;
    tablesServed: number;
    completedOrders: number;
    avgOrderMinutes: number | null;
    tipsMinor: string;
    serviceChargeMinor?: string;
    revenueMinor: string;
  } | null>(null);
  const [isMoveKotOpen, setIsMoveKotOpen] = useState(false);

  // Load Tables
  const fetchTables = async () => {
    try {
      const res = await authedFetch("/tables");
      if (res.ok) {
        const data = await res.json();
        const mapped: DiningTable[] = (data || []).map((tbl: any) => {
          const live = !!tbl.currentOrder;
          let status: DiningTable["status"] = "VACANT";
          if (!live) status = "VACANT";
          else if (tbl.status === "PRINTED" || tbl.status === "BILLING" || tbl.status === "PAID") status = "BILLING";
          else status = "OCCUPIED";
          return {
            id: tbl.id,
            tableNumber: tbl.tableNumber,
            capacity: tbl.groupCapacity || tbl.capacity || 4,
            section: tbl.section || "General",
            status,
            isActive: tbl.isActive !== false,
            kitchenStage: tbl.kitchenStage || null,
            orderStatus: tbl.currentOrder?.status || null,
            currentOrderId: tbl.currentOrder?.id || tbl.activeOrderId || null,
            mergeGroupId: tbl.mergeGroupId || null,
            mergePrimaryTableId: tbl.mergePrimaryTableId || null,
            mergedWith: Array.isArray(tbl.mergedWith) ? tbl.mergedWith : [],
            isMergePrimary: !!tbl.isMergePrimary,
            currentOrder: tbl.currentOrder
              ? { id: tbl.currentOrder.id, kots: tbl.currentOrder.kots || [] }
              : null,
          };
        });
        setTables(mapped);
      }
    } catch (e) {
      console.error("Failed to fetch tables", e);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchMyStats = async () => {
    try {
      const res = await authedFetch("/waiters/me/stats");
      if (res.ok) setMyStats(await res.json());
    } catch {
      // keep last snapshot
    }
  };

  // Load Menu
  const fetchMenu = async () => {
    setLoadingMenu(true);
    try {
      const res = await authedFetch("/menu/items");
      if (res.ok) {
        const data = await res.json();
        const rawItems = Array.isArray(data) ? data : data.items || [];
        const rawOverrides = typeof window !== "undefined" ? localStorage.getItem("kapmeta_stock_overrides") : null;
        const overrides = rawOverrides ? JSON.parse(rawOverrides) : {};
        const mapped: MenuItem[] = rawItems.map((item: any) => ({
          id: item.id,
          name: item.name || "Dish",
          category: item.categoryName || item.category?.name || item.category || "General",
          description: item.description || "",
          priceMinor: Number(item.priceMinor || (Number(item.price || 0) * 100)),
          isVeg: item.isVeg ?? true,
          isStocked: overrides[item.id] !== undefined
            ? overrides[item.id]
            : (item.isStocked !== undefined ? item.isStocked : (item.availability ? item.availability.isStocked : (item.isActive ?? true))),
          stockQty: item.availability ? item.availability.stockQty : (item.stockQty ?? 100),
          icon: item.icon || "🍽️",
        }));
        setMenuItems(mapped);
        const cats = Array.from(new Set(mapped.map((item) => item.category).filter(Boolean)));
        setCategories(["All", ...cats]);
      } else if (menuItems.length === 0) {
        // Live fetch failed and we have nothing on screen yet — fall back to the
        // offline snapshot so the tablet isn't blank, rather than as the default.
        setMenuItems(OFFLINE_FALLBACK_MENU_ITEMS);
        const cats = Array.from(new Set(OFFLINE_FALLBACK_MENU_ITEMS.map((item) => item.category).filter(Boolean)));
        setCategories(["All", ...cats]);
      }
    } catch (e) {
      console.error("Failed to fetch menu items", e);
      if (menuItems.length === 0) {
        setMenuItems(OFFLINE_FALLBACK_MENU_ITEMS);
        const cats = Array.from(new Set(OFFLINE_FALLBACK_MENU_ITEMS.map((item) => item.category).filter(Boolean)));
        setCategories(["All", ...cats]);
      }
    } finally {
      setLoadingMenu(false);
    }
  };

  // Load Waiter Active KOTs
  const fetchKots = async () => {
    const gen = ++kotFetchGen.current;
    try {
      const res = await authedFetch("/kitchen/kot");
      if (!res.ok) return;
      const data = await res.json();
      const rows: KOTTicket[] = Array.isArray(data) ? data : Array.isArray(data?.tickets) ? data.tickets : [];
      const live = rows.filter((k) => k.status === "QUEUED" || k.status === "PREPARING" || k.status === "READY");
      // #region agent log
      fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
        body: JSON.stringify({
          sessionId: "9c675b",
          runId: "wave2-ws",
          hypothesisId: "F",
          location: "waiter.tsx:fetchKots",
          message: "waiter kitchen tickets",
          data: {
            gen,
            applied: gen === kotFetchGen.current,
            rawCount: rows.length,
            liveCount: live.length,
            statuses: rows.map((k) => k.status),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (gen !== kotFetchGen.current) return;
      setMyKots(live);
    } catch (e) {
      console.error("Failed to fetch KOTs", e);
    }
  };

  const heartbeat = async () => {
    try {
      await authedFetch("/waiters/heartbeat", { method: "POST" });
    } catch {
      // offline — presence just goes stale, nothing to queue
    }
  };

  const flushOfflineQueue = async () => {
    const queue = loadOfflineQueue();
    if (queue.length === 0) return;
    const remaining: QueuedRequest[] = [];
    for (const req of queue) {
      try {
        const res = await authedFetch(req.url, {
          method: req.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
        });
        if (!res.ok) remaining.push(req);
      } catch {
        remaining.push(req);
      }
    }
    saveOfflineQueue(remaining);
    setOfflineCount(remaining.length);
    if (remaining.length < queue.length) {
      fetchTables();
      fetchKots();
      showPickupNotification(`Synced ${queue.length - remaining.length} queued order(s)`);
    }
  };

  useEffect(() => {
    setMounted(true);
    setOfflineQueue(loadOfflineQueue());
    if (authLoading) return;
    fetchTables();
    fetchMenu();
    fetchKots();
    heartbeat();
    setOfflineCount(loadOfflineQueue().length);

    // Real-time 86 Stock Control Listener
    const handleAvailabilityChange = (e: any) => {
      if (e.detail && e.detail.itemId !== undefined) {
        setMenuItems((prev) =>
          prev.map((it) =>
            it.id === e.detail.itemId
              ? { ...it, isStocked: e.detail.isStocked, stockQty: e.detail.stockQty ?? 100 }
              : it
          )
        );
      }
    };
    window.addEventListener("item-availability-changed", handleAvailabilityChange);

    const goOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(navigator.onLine);

    const interval = setInterval(() => {
      fetchTables();
      fetchKots();
      // Menu items/categories/prices/availability are edited from the admin
      // menu page (and the 86 toggle modal) on a different device/tab; without
      // this the waiter tablet only ever sees the menu as it was at page load.
      // Same polling cadence/pattern as the rest of this app (see kitchen.tsx's
      // KOT board refresh) rather than inventing a new transport.
      fetchMenu();
      heartbeat();
      if (navigator.onLine) flushOfflineQueue();
    }, 15000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [authLoading]);

  const showPickupNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 8000);
  };

  useKapmetaSocket(
    (payload) => {
      const status = payload.data?.status;
      const stage = payload.data?.stage;
      const servedIds = [
        payload.data?.kotTicketId,
        ...((payload.data?.kotTicketIds as string[] | undefined) || []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0);

      if (status === "SERVED" && servedIds.length > 0) {
        setMyKots((prev) => prev.filter((k) => !servedIds.includes(k.id)));
      }

      fetchKots();
      fetchTables();
      fetchMyStats();
      const openOrderId = manageOrderRef.current?.id;
      if (openOrderId) {
        authedFetch(`/orders/${openOrderId}`)
          .then(async (r) => {
            if (r.ok) setManageOrder(await r.json());
          })
          .catch(() => {});
      }
      if (
        (payload.topic === "kot.status_updated" && status === "READY") ||
        (payload.topic === "order.status_updated" && stage === "FOOD_READY")
      ) {
        const ticketId = String(payload.data?.kotTicketId || payload.data?.orderId || "");
        const msg = `Order/Ticket #${ticketId.slice(-4)} is READY at the pickup counter!`;
        showPickupNotification(msg);
        playPickupBeep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Kitchen: Order Ready", { body: msg, icon: undefined });
        }
      }
    },
    !authLoading,
    "waiter"
  );

  // Unique sections list
  const sections = useMemo(() => {
    const s = Array.from(new Set(tables.map((t) => t.section))).filter(Boolean) as string[];
    return ["All", ...s];
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => selectedSection === "All" || t.section === selectedSection);
  }, [tables, selectedSection]);

  // Filtered menu
  const filteredMenu = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === "All" || item.category === selectedCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());

      let matchDiet = true;
      if (dietaryFilter === "VEG_ONLY") matchDiet = item.isVeg === true;
      else if (dietaryFilter === "NON_VEG_ONLY") matchDiet = item.isVeg === false;
      else if (dietaryFilter === "BESTSELLERS_ONLY") matchDiet = (item.priceMinor > 8000 && item.priceMinor < 20000);

      return matchCat && matchSearch && matchDiet;
    });
  }, [menuItems, selectedCategory, searchQuery, dietaryFilter]);

  const addCustomizedToCart = (item: MenuItemData, customization: CustomizedItemSelection) => {
    const customizedName = `${item.name} (${customization.portion === "HALF" ? "Half" : customization.portion === "FULL" ? "Full" : "Reg"}${customization.addons.length > 0 ? " + " + customization.addons.map((a) => a.name).join(", ") : ""})`;
    const customItem: MenuItem = {
      id: item.id,
      name: customizedName,
      category: item.category,
      description: item.description || "",
      priceMinor: customization.finalPriceMinor,
      isVeg: item.isVeg,
      isStocked: item.isStocked ?? true,
      stockQty: item.stockQty ?? 100,
      icon: "🍽️",
    };

    setCart((prev) => [
      ...prev,
      {
        item: customItem,
        quantity: 1,
        course: selectedCourse,
        seatNumber: selectedSeat,
        notes: customization.specialInstructions || "",
      },
    ]);
  };

  // Cart operations
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        return prev.map((ci) => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      }
      return [...prev, { item, quantity: 1, notes: "", course: selectedCourse, seatNumber: selectedSeat }];
    });
  };

  const updateItemCourse = (itemId: string, course: Course) => {
    setCart((prev) => prev.map((ci) => (ci.item.id === itemId ? { ...ci, course } : ci)));
  };

  const updateItemSeat = (itemId: string, seatNumber: number | null) => {
    setCart((prev) => prev.map((ci) => (ci.item.id === itemId ? { ...ci, seatNumber } : ci)));
  };

  const updateQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
    } else {
      setCart((prev) => prev.map((ci) => ci.item.id === itemId ? { ...ci, quantity: qty } : ci));
    }
  };

  const updateItemNotes = (itemId: string, notes: string) => {
    setCart((prev) => prev.map((ci) => ci.item.id === itemId ? { ...ci, notes } : ci));
  };

  const totalAmount = useMemo(() => {
    return cart.reduce((acc, ci) => acc + (ci.item.priceMinor * ci.quantity), 0);
  }, [cart]);

  const loadedWaiterTableRef = React.useRef<string | null>(null);
  const isWaiterLoadedRef = React.useRef<boolean>(false);

  // Sync draft cart to localStorage ONLY when loaded for this specific active table
  useEffect(() => {
    if (
      isWaiterLoadedRef.current &&
      activeTable &&
      loadedWaiterTableRef.current === activeTable.tableNumber &&
      !manageOrder &&
      typeof window !== "undefined"
    ) {
      if (cart.length > 0) {
        localStorage.setItem(`kapmeta_draft_${activeTable.tableNumber}`, JSON.stringify(cart));
      } else {
        localStorage.removeItem(`kapmeta_draft_${activeTable.tableNumber}`);
      }
    }
  }, [cart, activeTable, manageOrder]);

  const openNewOrder = (table: DiningTable) => {
    isWaiterLoadedRef.current = false;
    loadedWaiterTableRef.current = table.tableNumber;
    setActiveTable(table);
    setCoversCount(table.capacity || 2);
    setManageOrder(null);
    let loaded = false;
    if (typeof window !== "undefined") {
      try {
        const draft = localStorage.getItem(`kapmeta_draft_${table.tableNumber}`) || localStorage.getItem(`kapmeta_draft_${table.id}`);
        if (draft) {
          const parsed = JSON.parse(draft);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCart(parsed);
            loaded = true;
          }
        }
      } catch (e) {}
    }
    if (!loaded) {
      setCart([]);
    }
    isWaiterLoadedRef.current = true;
  };

  // Place Table Order — courseFilter fires only that course's cart lines (course-wise firing);
  // omit to fire the whole cart at once.
  const submitOrder = async (courseFilter?: Course) => {
    if (!activeTable) return;
    const firing = courseFilter ? cart.filter((ci) => ci.course === courseFilter) : cart;
    if (firing.length === 0) return;
    setSubmittingOrder(true);
    setOrderError(null);

    const idempotencyKey = `waiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const lines = firing.map((ci) => ({
      menuItemId: ci.item.id,
      quantity: ci.quantity,
      modifierOptionIds: [],
      notes: ci.notes || undefined,
      course: ci.course,
      seatNumber: ci.seatNumber ?? undefined,
    }));
    const body = {
      action: "KOT",
      status: "KOT_CREATED",
      terminalNumber: "T-01",
      orderType: "DINE_IN",
      diningTableId: activeTable.mergePrimaryTableId || activeTable.id,
      tableNumber: activeTable.tableNumber,
      waiterId: me?.userId,
      idempotencyKey,
      lines,
    };

    try {
      const existingOrderId = activeTable.currentOrderId;
      const res = existingOrderId
        ? await authedFetch(`/orders/${existingOrderId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines }),
          })
        : await authedFetch("/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (res.ok) {
        const created = await res.json();
        const orderId = created.id || existingOrderId;
        if (!created.alreadyExisted && created.id) {
          await authedFetch(`/orders/${created.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toStatus: "CONFIRMED" }),
          }).catch((e) => console.error("Failed to auto-confirm order", e));
        }
        if (activeTable && typeof window !== "undefined") {
          localStorage.removeItem(`kapmeta_draft_${activeTable.tableNumber}`);
          localStorage.removeItem(`kapmeta_draft_${activeTable.id}`);
        }
        setCart((prev) => prev.filter((ci) => !firing.includes(ci)));
        if (courseFilter && !manageOrder && orderId) {
          const detailRes = await authedFetch(`/orders/${orderId}`);
          if (detailRes.ok) setManageOrder(await detailRes.json());
        } else if (!courseFilter) {
          setActiveTable(null);
        }
        fetchTables();
        fetchKots();
        showPickupNotification(`KOT sent for Table ${activeTable.tableNumber}.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        // #region agent log
        fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
          body: JSON.stringify({
            sessionId: "9c675b",
            runId: "waiter-kot",
            hypothesisId: "G",
            location: "waiter.tsx:submitOrder:fail",
            message: "waiter order POST failed",
            data: { table: activeTable.tableNumber, httpStatus: res.status, error: errData.error },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setOrderError(errData.error || "Failed to place order");
      }
    } catch (e) {
      // Offline — queue it. idempotencyKey guarantees a later retry can't double-create.
      const queue = loadOfflineQueue();
      queue.push({ id: idempotencyKey, url: "/orders", method: "POST", body });
      saveOfflineQueue(queue);
      setOfflineCount(queue.length);
      setCart((prev) => prev.filter((ci) => !firing.includes(ci)));
      if (!courseFilter) setActiveTable(null);
      showPickupNotification("Offline — order queued, will sync when back online");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Change Table Status directly
  const updateTableStatus = async (tableId: string, status: "VACANT" | "OCCUPIED" | "BILLING" | "DIRTY") => {
    try {
      const url = status === "VACANT" ? `/tables/${tableId}/vacant` : `/tables/${tableId}/status`;
      const res = await authedFetch(url, {
        method: status === "VACANT" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: status === "VACANT" ? undefined : JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchTables();
      } else {
        const errData = await res.json().catch(() => ({}));
        setTableActionError(errData.error || "Could not update table");
        showPickupNotification(errData.error || "Could not update table");
      }
    } catch (e) {
      console.error("Failed to update table status", e);
    }
  };

  const serveTable = async (table: DiningTable) => {
    try {
      const res = await authedFetch(`/tables/${table.id}/serve`, { method: "POST" });
      if (res.ok) {
        fetchTables();
        fetchKots();
        showPickupNotification(`Table ${table.tableNumber} served — still running until billed`);
        if (activeTableRef.current?.id === table.id) {
          await openManageTable(table);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        showPickupNotification(errData.error || "Serve failed");
      }
    } catch (e) {
      console.error("Failed to serve table", e);
    }
  };

  // Open an OCCUPIED table for management (add items / void / bill) — loads its live order
  const openManageTable = async (table: DiningTable) => {
    setActiveTable(table);
    setCart([]);
    setManageOrder(null);
    setLoadingManageOrder(true);
    try {
      const activeRes = await authedFetch(`/orders/by-table/${table.id}/active`);
      if (!activeRes.ok) {
        setOrderError("No active order found for this table");
        return;
      }
      const { id: orderId } = await activeRes.json();
      const detailRes = await authedFetch(`/orders/${orderId}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setManageOrder(detail);
        // #region agent log
        fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
          body: JSON.stringify({
            sessionId: "9c675b",
            runId: "waiter-lifecycle",
            hypothesisId: "H",
            location: "waiter.tsx:openManageTable",
            message: "manage order kitchenStatus",
            data: {
              table: table.tableNumber,
              orderId: detail.id,
              orderStatus: detail.status,
              kitchenStatuses: (detail.items || []).map((i: any) => i.kitchenStatus),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
    } catch (e) {
      console.error("Failed to load table order", e);
    } finally {
      setLoadingManageOrder(false);
    }
  };

  const refreshManageOrder = async () => {
    if (!manageOrder) return;
    const res = await authedFetch(`/orders/${manageOrder.id}`);
    if (res.ok) setManageOrder(await res.json());
  };

  // Send cart items as additional items on an already-fired order (fires its own KOT).
  // courseFilter fires only that course's lines — used for course-wise firing.
  const submitAddItems = async (courseFilter?: Course) => {
    if (!manageOrder) return;
    const firing = courseFilter ? cart.filter((ci) => ci.course === courseFilter) : cart;
    if (firing.length === 0) return;
    setSubmittingOrder(true);
    setOrderError(null);
    const lines = firing.map((ci) => ({
      menuItemId: ci.item.id,
      quantity: ci.quantity,
      modifierOptionIds: [],
      notes: ci.notes || undefined,
      course: ci.course,
      seatNumber: ci.seatNumber ?? undefined,
    }));
    const url = `/orders/${manageOrder.id}/items`;
    try {
      const res = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (res.ok) {
        setCart((prev) => prev.filter((ci) => !firing.includes(ci)));
        await refreshManageOrder();
        fetchKots();
        showPickupNotification("Items sent to kitchen!");
      } else {
        const errData = await res.json();
        setOrderError(errData.error || "Failed to add items");
      }
    } catch (e) {
      const queue = loadOfflineQueue();
      queue.push({ id: `${manageOrder.id}-${Date.now()}`, url, method: "POST", body: { lines } });
      saveOfflineQueue(queue);
      setOfflineCount(queue.length);
      setCart((prev) => prev.filter((ci) => !firing.includes(ci)));
      showPickupNotification("Offline — items queued, will sync when back online");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const voidItem = async (itemId: string) => {
    const reasonCode = prompt("Reason for voiding this item?");
    if (!reasonCode) return;
    try {
      const res = await authedFetch(`/orders/${manageOrder?.id}/items/${itemId}/void`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode }),
      });
      if (res.ok) {
        await refreshManageOrder();
      } else {
        const errData = await res.json();
        setOrderError(errData.error || "Failed to void item");
      }
    } catch (e) {
      setOrderError("Network error voiding item");
    }
  };

  // Transfer: move active order from one table to a chosen vacant table
  const startTransfer = (table: DiningTable) => {
    setTableActionError(null);
    setTransferFromTable(table);
  };

  const completeTransfer = async (toTableId: string) => {
    if (!transferFromTable) return;
    try {
      const res = await authedFetch(`/tables/${transferFromTable.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTableId: toTableId, toTableId }),
      });
      if (res.ok) {
        setTransferFromTable(null);
        fetchTables();
        showPickupNotification(`Table ${transferFromTable.tableNumber} transferred successfully!`);
      } else {
        const errData = await res.json();
        setTableActionError(errData.error || "Transfer failed");
      }
    } catch (e) {
      setTableActionError("Network error during transfer");
    }
  };

  // Merge: fold selected occupied tables' orders into one target table
  const toggleMergeSource = (tableId: string) => {
    setMergeSourceIds((prev) => (prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]));
  };

  const completeMerge = async (targetTableId: string) => {
    if (mergeSourceIds.length === 0) return;
    try {
      const res = await authedFetch("/tables/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTableIds: mergeSourceIds, targetTableId }),
      });
      // #region agent log
      fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
        body: JSON.stringify({
          sessionId: "9c675b",
          runId: "merge-fix",
          hypothesisId: "Q",
          location: "waiter.tsx:completeMerge",
          message: "waiter merge POST /tables/merge",
          data: { ok: res.ok, status: res.status, sourceTableIds: mergeSourceIds, targetTableId },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (res.ok) {
        setMergeSourceIds([]);
        setMergeMode(false);
        fetchTables();
        fetchKots();
        showPickupNotification("Tables merged!");
      } else {
        const errData = await res.json();
        setTableActionError(errData.error || "Merge failed");
      }
    } catch (e) {
      setTableActionError("Network error during merge");
    }
  };

  // Bill & payment
  const openBill = async (table: DiningTable) => {
    setBillTable(table);
    setBill(null);
    setSeatBills([]);
    setSplitBySeat(false);
    setTipInput("");
    setServiceChargeInput("");
    setLoadingBill(true);
    try {
      const orderId = table.currentOrderId;
      let resolvedOrderId = orderId || null;
      if (!resolvedOrderId) {
        const activeRes = await authedFetch(`/orders/by-table/${table.id}/active`);
        if (!activeRes.ok) return;
        const { id } = await activeRes.json();
        resolvedOrderId = id;
      }
      const billRes = await authedFetch(`/orders/${resolvedOrderId}/bill`);
      if (billRes.ok) {
        const b = await billRes.json();
        setBill(b);
        setPaymentAmount((Number(b.dueMinor) / 100).toFixed(2));
        setTipInput((Number(b.tipTotalMinor) / 100).toFixed(2));
        setServiceChargeInput((Number(b.serviceChargeTotalMinor) / 100).toFixed(2));
      }
    } catch (e) {
      console.error("Failed to load bill", e);
    } finally {
      setLoadingBill(false);
    }
  };

  const loadSeatBills = async () => {
    if (!bill) return;
    try {
      const res = await authedFetch(`/orders/${bill.orderId}/bill/by-seat`);
      if (res.ok) setSeatBills(await res.json());
    } catch (e) {
      console.error("Failed to load seat bills", e);
    }
  };

  const applyCharges = async (): Promise<boolean> => {
    if (!bill) return false;
    setSavingCharges(true);
    try {
      const tipMinor = Math.round((parseFloat(tipInput) || 0) * 100);
      const serviceChargeMinor = Math.round((parseFloat(serviceChargeInput) || 0) * 100);
      // #region agent log
      fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
        body: JSON.stringify({
          sessionId: "9c675b",
          runId: "waiter-charges",
          hypothesisId: "K",
          location: "waiter.tsx:applyCharges",
          message: "waiter applying tip/service before bill",
          data: { orderId: bill.orderId, tipMinor, serviceChargeMinor },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const res = await authedFetch(`/orders/${bill.orderId}/charges`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipMinor, serviceChargeMinor }),
      });
      if (res.ok) {
        const refreshed = await authedFetch(`/orders/${bill.orderId}/bill`);
        if (refreshed.ok) {
          const b = await refreshed.json();
          setBill(b);
          setPaymentAmount((Number(b.dueMinor) / 100).toFixed(2));
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to apply charges", e);
      return false;
    } finally {
      setSavingCharges(false);
    }
  };

  const submitPayment = async (overrideAmountMinor?: number, seatNumber?: number) => {
    if (!bill) return;
    setSubmittingPayment(true);
    try {
      await applyCharges();
      const latestBillRes = await authedFetch(`/orders/${bill.orderId}/bill`);
      const latestBill = latestBillRes.ok ? await latestBillRes.json() : bill;
      if (latestBillRes.ok) setBill(latestBill);
      const amountMinor =
        overrideAmountMinor ??
        (Number(latestBill.dueMinor) || Math.round(parseFloat(paymentAmount) * 100));
      const alreadyPaidInFull = Number(latestBill.dueMinor) <= 0;
      if ((!amountMinor || amountMinor <= 0) && !alreadyPaidInFull) {
        setSubmittingPayment(false);
        return;
      }
      if (alreadyPaidInFull && billTable) {
        const settleRes = await authedFetch(`/orders/${bill.orderId}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethod }),
        });
        await authedFetch(`/tables/${billTable.id}/vacant`, { method: "POST" }).catch(() => {});
        setBillTable(null);
        fetchTables();
        fetchMyStats();
        showPickupNotification(settleRes.ok ? "Bill settled — table vacant" : "Settle failed");
        setSubmittingPayment(false);
        return;
      }
      const res = await authedFetch(`/orders/${bill.orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor, method: paymentMethod, seatNumber }),
      });
      if (res.ok) {
        const refreshed = await authedFetch(`/orders/${bill.orderId}/bill`);
        if (refreshed.ok) {
          const b = await refreshed.json();
          setBill(b);
          if (Number(b.dueMinor) <= 0 && billTable) {
            const settleRes = await authedFetch(`/orders/${bill.orderId}/settle`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentMethod }),
            });
            // #region agent log
            fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
              body: JSON.stringify({
                sessionId: "9c675b",
                runId: "post-merge",
                hypothesisId: "W",
                location: "waiter.tsx:submitPayment",
                message: "waiter pay then settle",
                data: {
                  orderId: bill.orderId,
                  tableId: billTable.id,
                  tableNumber: billTable.tableNumber,
                  mergeGroupId: billTable.mergeGroupId || null,
                  settleOk: settleRes.ok,
                  settleStatus: settleRes.status,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            if (!settleRes.ok) {
              const errData = await settleRes.json().catch(() => ({}));
              showPickupNotification(errData.error || "Paid, but settle failed");
            }
            const vacantRes = await authedFetch(`/tables/${billTable.id}/vacant`, { method: "POST" }).catch(() => null);
            // #region agent log
            fetch("http://127.0.0.1:7323/ingest/28c85a32-5ef1-4fe5-9437-78139f7a5bfb", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c675b" },
              body: JSON.stringify({
                sessionId: "9c675b",
                runId: "post-fix",
                hypothesisId: "W",
                location: "waiter.tsx:submitPayment:vacant",
                message: "waiter vacant after settle",
                data: {
                  orderId: bill.orderId,
                  tableId: billTable.id,
                  vacantOk: vacantRes ? vacantRes.ok : false,
                  vacantStatus: vacantRes ? vacantRes.status : null,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            setBillTable(null);
            fetchTables();
            fetchMyStats();
            showPickupNotification("Bill settled — table vacant");
          }
        }
        if (splitBySeat) await loadSeatBills();
        showPickupNotification("Payment recorded!");
      }
    } catch (e) {
      console.error("Payment failed", e);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Serve KOT (Waiter food delivery)
  const serveKot = async (ticketId: string) => {
    try {
      const res = await authedFetch(`/kitchen/kot/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: "SERVED" }),
      });
      if (res.ok) {
        fetchKots();
        fetchTables();
        const openOrderId = manageOrderRef.current?.id;
        if (openOrderId) {
          const detailRes = await authedFetch(`/orders/${openOrderId}`);
          if (detailRes.ok) setManageOrder(await detailRes.json());
        }
      }
    } catch (e) {
      console.error("Failed to serve KOT", e);
    }
  };

  if (!mounted || authLoading || loadingTables) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading floor map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f6] text-[#18181b] flex flex-col font-sans">
      <Head>
        <title>KapMeta Waiter & Captain — {me?.outlet?.name || "Hotel Kapila"}</title>
      </Head>

      <div className="flex-1 flex flex-col min-w-0">

      {/* Shakuro Executive Navigation Dock */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#f4f4f5] px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCaptainDrawerOpen(true)}
            className="w-9 h-9 rounded-xl bg-[#f4f4f6] hover:bg-[#e4e4e7] text-[#18181b] flex items-center justify-center transition"
            title="Open Captain Workspace Drawer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#18181b] flex items-center justify-center text-white font-black text-xs relative shadow-sm">
              <span>K</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-1 right-1"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#18181b] text-xs tracking-tight">KAPMETA WAITER</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.2 rounded-full border border-emerald-200">Live</span>
              </div>
              <div className="text-[11px] text-[#71717a] font-medium">{me?.outlet?.name || "Hotel Kapila"}</div>
            </div>
          </div>
        </div>

        {/* Center: Search & Staff Avatar Pill */}
        <div className="hidden md:flex items-center gap-2 bg-[#f4f4f6] px-4 py-1.5 rounded-full text-xs text-[#71717a] border border-[#e4e4e7]/60">
          <span>🔍</span>
          <span className="font-medium">Try searching "Table 04" or dishes</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* Active Waiter Avatar Pill */}
          <div className="hidden sm:flex items-center gap-2 bg-[#f4f4f6] px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 rounded-full bg-[#f43f5e] text-white flex items-center justify-center font-bold text-[10px]">
              {me?.name?.charAt(0) || "W"}
            </div>
            <span className="font-bold text-[#18181b] text-[11px]">{me?.name || "Floor Lead"}</span>
          </div>

          <Link
            href="/"
            className="flex items-center gap-1 bg-[#f4f4f6] hover:bg-[#e4e4e7] text-[#18181b] px-3 py-1.5 rounded-full text-[11px] font-bold transition"
            title="Switch to POS Terminal"
          >
            🖥️ POS
          </Link>

          <Link
            href="/kitchen"
            className="flex items-center gap-1 bg-[#f4f4f6] hover:bg-[#e4e4e7] text-[#18181b] px-3 py-1.5 rounded-full text-[11px] font-bold transition"
            title="Switch to Kitchen KOT"
          >
            👨‍🍳 KOT
          </Link>

          <button
            type="button"
            onClick={() => setIsCashTipsCalculatorOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full text-[11px] font-bold hover:bg-emerald-100 transition"
            title="Shift Cash & Tips Reconciliation"
          >
            💰 Cash & Tips
          </button>

          <button
            type="button"
            onClick={() => setIsPinLoginModalOpen(true)}
            className="flex items-center gap-1.5 bg-[#18181b] text-white hover:bg-[#27272a] px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-sm transition"
            title="Fast PIN Switch Staff"
          >
            🧑‍🍳 PIN
          </button>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-full text-[11px] font-bold transition"
            title="Log Out & End Shift"
          >
            🚪 Exit
          </button>

          {offlineCount > 0 ? (
            <button
              type="button"
              onClick={() => setIsUnsuccessfulModalOpen(true)}
              className="flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-bold"
            >
              ⚠️ {offlineCount}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
              ● Sync
            </span>
          )}
        </div>
      </div>

      {/* Real-time alert banner */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-indigo-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-indigo-400 max-w-sm">
          <span className="text-2xl">🍳</span>
          <div>
            <p className="font-semibold text-sm">Kitchen Announcement</p>
            <p className="text-xs text-indigo-100 mt-0.5">{toastMessage}</p>
          </div>
          <button onClick={() => setToastMessage(null)} className="ml-auto text-indigo-200 hover:text-white text-lg">×</button>
        </div>
      )}

      <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full">
        {/* Dedicated Full-Screen Order Taking Canvas when a table is selected */}
        {activeTable ? (
          <div className="w-full flex flex-col gap-4 animate-fade-in">
            {/* Shakuro Active Table Cockpit Header */}
            <div className="bg-white border border-[#f4f4f5] rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTable(null);
                    setManageOrder(null);
                    setCart([]);
                  }}
                  className="bg-[#f4f4f6] hover:bg-[#e4e4e7] text-[#18181b] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition"
                >
                  ← Floor Map
                </button>

                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-black text-[#18181b] tracking-tight">
                    Table {activeTable.tableNumber}
                  </span>
                  <span className="text-xs bg-[#f4f4f6] text-[#71717a] px-3 py-1 rounded-full font-bold">
                    {activeTable.section}
                  </span>
                  {manageOrder ? (
                    <span className={`text-xs border px-3 py-1 rounded-full font-bold ${
                      manageOrder.items.filter((i) => !i.isVoided).every((i) => i.kitchenStatus === "SERVED")
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {manageOrder.items.filter((i) => !i.isVoided).every((i) => i.kitchenStatus === "SERVED")
                        ? `Served · #${manageOrder.orderNumber}`
                        : `Running · #${manageOrder.orderNumber}`}
                    </span>
                  ) : (
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-bold">
                      New Order
                    </span>
                  )}
                </div>
              </div>

              {/* Middle: Covers Pax Counter & View Switcher */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#f4f4f6] border border-[#e4e4e7] px-3.5 py-1.5 rounded-full">
                  <span className="text-[11px] text-[#71717a] font-bold">Covers:</span>
                  <button
                    type="button"
                    onClick={() => setCoversCount((c) => Math.max(1, c - 1))}
                    className="w-5 h-5 rounded-full bg-white text-[#18181b] font-bold flex items-center justify-center shadow-sm hover:bg-[#e4e4e7] active:scale-90"
                  >
                    −
                  </button>
                  <span className="text-xs font-black text-[#18181b] min-w-[18px] text-center">{coversCount}</span>
                  <button
                    type="button"
                    onClick={() => setCoversCount((c) => c + 1)}
                    className="w-5 h-5 rounded-full bg-white text-[#18181b] font-bold flex items-center justify-center shadow-sm hover:bg-[#e4e4e7] active:scale-90"
                  >
                    +
                  </button>
                  <span className="text-[11px] text-[#71717a]">Pax</span>
                </div>

                <div className="flex items-center bg-[#f4f4f6] p-1 rounded-full gap-1">
                  <button
                    type="button"
                    onClick={() => setMenuViewMode("tile")}
                    className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${
                      menuViewMode === "tile" ? "bg-white text-[#18181b] shadow-sm" : "text-[#71717a] hover:text-[#18181b]"
                    }`}
                  >
                    🖼️ Tiles
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuViewMode("compact")}
                    className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${
                      menuViewMode === "compact" ? "bg-white text-[#18181b] shadow-sm" : "text-[#71717a] hover:text-[#18181b]"
                    }`}
                  >
                    📋 List
                  </button>
                </div>
              </div>
            </div>

            {/* 2-Column Ordering Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 8 Cols: Search, Filters, Categories & Food Photos Grid */}
              <div className="lg:col-span-8 flex flex-col gap-3">
                {/* Search & Filter Toolbar */}
                <div className="bg-white border border-[#f4f4f5] p-5 rounded-3xl flex flex-col gap-3.5 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-2.5 text-[#71717a]">🔍</span>
                      <input
                        type="text"
                        placeholder="Search dish by name, category, or code..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#f4f4f6] border border-[#e4e4e7] rounded-full pl-9 pr-4 py-2 text-xs text-[#18181b] placeholder-[#a1a1aa] focus:outline-none focus:border-[#18181b]"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3.5 top-2 text-[#71717a] hover:text-[#18181b] text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Dietary Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      <button
                        type="button"
                        onClick={() => setDietaryFilter("ALL")}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                          dietaryFilter === "ALL" ? "bg-[#18181b] text-white shadow-sm" : "bg-[#f4f4f6] text-[#71717a] hover:text-[#18181b]"
                        }`}
                      >
                        All ({menuItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDietaryFilter("VEG_ONLY")}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                          dietaryFilter === "VEG_ONLY" ? "bg-emerald-600 text-white shadow-sm" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        🟢 Veg
                      </button>
                      <button
                        type="button"
                        onClick={() => setDietaryFilter("NON_VEG_ONLY")}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                          dietaryFilter === "NON_VEG_ONLY" ? "bg-rose-600 text-white shadow-sm" : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        🔴 Non-Veg
                      </button>
                      <button
                        type="button"
                        onClick={() => setDietaryFilter("BESTSELLERS_ONLY")}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                          dietaryFilter === "BESTSELLERS_ONLY" ? "bg-amber-500 text-white shadow-sm" : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        ⭐ Bestsellers
                      </button>
                    </div>
                  </div>

                  {/* Categories Row */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                      onClick={() => setSelectedCategory("All")}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${
                        selectedCategory === "All" ? "bg-[#18181b] text-white shadow-sm" : "bg-[#f4f4f6] text-[#71717a] hover:text-[#18181b]"
                      }`}
                    >
                      🍽️ All Dishes
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelectedCategory(c)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${
                          selectedCategory === c ? "bg-[#18181b] text-white shadow-sm" : "bg-[#f4f4f6] text-[#71717a] hover:text-[#18181b]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {/* Target Course Selector */}
                  <div className="flex items-center gap-2 bg-[#f4f4f6] p-2 rounded-2xl border border-[#e4e4e7]/60">
                    <span className="text-xs text-[#71717a] font-bold px-2">Active Course:</span>
                    <div className="flex gap-1.5 overflow-x-auto">
                      {COURSES.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSelectedCourse(c)}
                          className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${
                            selectedCourse === c ? "bg-[#18181b] text-white shadow-sm" : "bg-white text-[#71717a] hover:text-[#18181b]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dishes Photo Grid */}
                <div className="bg-white border border-[#f4f4f5] rounded-3xl p-5 min-h-[580px] max-h-[calc(100vh-280px)] overflow-y-auto shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                  {loadingMenu && menuItems.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 text-sm">
                      Loading menu…
                    </div>
                  ) : filteredMenu.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 text-sm">
                      No dishes found matching the current filters.
                    </div>
                  ) : (
                    <div className={menuViewMode === "tile" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2.5"}>
                      {filteredMenu.map((item) => {
                        const cartItem = cart.find((ci) => ci.item.id === item.id);
                        const cartQty = cartItem ? cartItem.quantity : 0;

                        return (
                          <AttractiveMenuItemCard
                            key={item.id}
                            item={{
                              ...item,
                              isBestseller: item.priceMinor > 8000 && item.priceMinor < 20000,
                            }}
                            cartQuantity={cartQty}
                            onAdd={() => addToCart(item)}
                            onIncrement={() => updateQuantity(item.id, cartQty + 1)}
                            onDecrement={() => updateQuantity(item.id, cartQty - 1)}
                            onCustomize={(it) => setCustomizingItem(it)}
                            viewMode={menuViewMode}
                            compact={menuViewMode === "compact"}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 4 Cols: Live Cart Ticket & Actions */}
              <div className="lg:col-span-4 flex flex-col gap-4 sticky top-4">
                <div className="bg-white border border-[#f4f4f5] rounded-3xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.03)] flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-[#f4f4f5] pb-3">
                    <h3 className="text-sm font-black text-[#18181b] flex items-center gap-2">
                      <span>🛒 Order Ticket</span>
                      <span className="text-xs bg-[#f4f4f6] text-[#18181b] px-2.5 py-0.5 rounded-full font-bold">
                        {cart.reduce((s, i) => s + i.quantity, 0)} items
                      </span>
                    </h3>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-xs text-rose-500 hover:text-rose-600 font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Fired items if managing */}
                  {manageOrder && manageOrder.items.filter((i) => !i.isVoided).length > 0 && (
                    <div className="border border-[#f4f4f5] rounded-2xl p-3.5 bg-[#fafafa] max-h-36 overflow-y-auto">
                      <div className="text-[10px] font-bold text-[#71717a] uppercase mb-2">
                        {manageOrder.items.filter((i) => !i.isVoided).every((i) => i.kitchenStatus === "SERVED")
                          ? "Served — table still running"
                          : "Fired tickets"}
                      </div>
                      {manageOrder.items.filter((i) => !i.isVoided).map((i) => (
                        <div key={i.id} className="flex justify-between items-center text-xs text-[#18181b] py-1 border-b border-[#f4f4f5] last:border-0">
                          <span>
                            {i.menuItemName} <b className="text-emerald-600">x{i.quantity}</b>
                            <span className={`ml-2 text-[10px] font-bold ${
                              i.kitchenStatus === "SERVED" ? "text-emerald-600" :
                              i.kitchenStatus === "READY" ? "text-amber-600" :
                              i.kitchenStatus === "PREPARING" ? "text-blue-600" : "text-[#71717a]"
                            }`}>
                              {kitchenItemLabel(i.kitchenStatus)}
                            </span>
                          </span>
                          <button
                            onClick={() => voidItem(i.id)}
                            className="text-[10px] text-rose-500 hover:text-rose-600 font-bold"
                          >
                            Void
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unsent Cart Items List */}
                  <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto min-h-[140px] pr-1">
                    {cart.length === 0 ? (
                      <div className="text-center py-10 text-[#a1a1aa] text-xs flex flex-col items-center gap-2">
                        <span className="text-3xl">🍽️</span>
                        <span className="font-semibold">Tap dishes to add to live order</span>
                      </div>
                    ) : (
                      cart.map((ci) => (
                        <div key={ci.item.id} className="bg-[#fafafa] border border-[#f4f4f5] rounded-2xl p-3.5 flex flex-col gap-2 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-xs text-[#18181b] block">{ci.item.name}</span>
                              <span className="text-[11px] text-[#71717a] font-medium">₹{(Number(ci.item.priceMinor) / 100).toFixed(2)} each</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-full border border-[#e4e4e7] shadow-sm">
                              <button
                                onClick={() => updateQuantity(ci.item.id, ci.quantity - 1)}
                                className="text-[#18181b] hover:bg-[#f4f4f6] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                              >
                                −
                              </button>
                              <span className="text-xs font-black text-[#18181b] min-w-[16px] text-center">{ci.quantity}</span>
                              <button
                                onClick={() => updateQuantity(ci.item.id, ci.quantity + 1)}
                                className="text-[#18181b] hover:bg-[#f4f4f6] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Course & Seat Tag */}
                          <div className="flex items-center gap-2">
                            <select
                              value={ci.course}
                              onChange={(e) => updateItemCourse(ci.item.id, e.target.value as Course)}
                              className="bg-white border border-[#e4e4e7] rounded-full px-2.5 py-0.5 text-[10px] text-[#18181b] font-bold"
                            >
                              {COURSES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              placeholder="Seat #"
                              value={ci.seatNumber ?? ""}
                              onChange={(e) => updateItemSeat(ci.item.id, e.target.value ? parseInt(e.target.value, 10) : null)}
                              className="w-16 bg-white border border-[#e4e4e7] rounded-full px-2 py-0.5 text-[10px] text-[#18181b] font-semibold text-center"
                            />
                          </div>

                          {/* Special Instructions */}
                          <input
                            type="text"
                            placeholder="Special notes for chef..."
                            value={ci.notes}
                            onChange={(e) => updateItemNotes(ci.item.id, e.target.value)}
                            className="bg-white border border-[#e4e4e7] rounded-full px-3 py-1 text-[10px] text-[#18181b] placeholder-[#a1a1aa] focus:outline-none focus:border-[#18181b]"
                          />
                        </div>
                      ))
                    )}
                  </div>

                  {orderError && <div className="text-rose-600 text-xs text-center bg-rose-50 p-2.5 rounded-xl border border-rose-200 font-bold">{orderError}</div>}

                  {/* Order Bill Summary */}
                  <div className="border-t border-[#f4f4f5] pt-3 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs text-[#71717a]">
                      <span>Subtotal:</span>
                      <span>₹{(totalAmount / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold text-[#18181b]">
                      <span>Total Amount:</span>
                      <span className="text-xl text-[#18181b] font-black">₹{(totalAmount / 100).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Fire KOT CTA Buttons */}
                  {COURSES.filter((c) => cart.some((ci) => ci.course === c)).map((c) => (
                    <button
                      key={c}
                      onClick={() => (manageOrder ? submitAddItems(c) : submitOrder(c))}
                      disabled={submittingOrder}
                      className="w-full bg-[#f4f4f6] hover:bg-[#e4e4e7] disabled:opacity-50 text-[#18181b] rounded-full py-2.5 text-xs font-bold transition-all"
                    >
                      Fire {c} Only ({cart.filter((ci) => ci.course === c).length})
                    </button>
                  ))}

                  <button
                    onClick={() => (manageOrder ? submitAddItems() : submitOrder())}
                    disabled={submittingOrder || cart.length === 0}
                    className="send-to-kitchen w-full bg-[#18181b] hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm py-4 rounded-full shadow-lg shadow-black/10 flex items-center justify-center gap-2 active:scale-[0.98] transition"
                  >
                    {submittingOrder ? "Sending..." : manageOrder ? "Send Added Items to Kitchen ›" : "Send Order to Kitchen (KOT) ›"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Shakuro Floor Map & Live Kitchen Outputs Workspace */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Tables Floor View */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-[#f4f4f5] shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-2xl font-black text-[#18181b] tracking-tight">Floor Map</h1>
                    <p className="text-xs text-[#71717a] mt-1 font-medium">Real-time table occupancy, active courses & guest turnarounds</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setMergeMode((v) => !v);
                        setMergeSourceIds([]);
                        setTransferFromTable(null);
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        mergeMode ? "bg-[#18181b] text-white shadow-sm" : "bg-[#f4f4f6] text-[#18181b] hover:bg-[#e4e4e7]"
                      }`}
                    >
                      {mergeMode ? "Cancel Merge" : "Merge Tables"}
                    </button>
                    <button
                      onClick={() => setIsMoveKotOpen(true)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#f4f4f6] text-[#18181b] hover:bg-[#e4e4e7] transition"
                    >
                      Move KOT
                    </button>
                    {offlineCount > 0 && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {offlineCount} queued
                      </span>
                    )}
                    <button
                      onClick={async () => {
                        setShowStats(true);
                        await fetchMyStats();
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#f4f4f6] text-[#18181b] hover:bg-[#e4e4e7] transition"
                    >
                      My Stats
                    </button>
                    <Link href="/waiter-monitor" className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#f4f4f6] text-[#18181b] hover:bg-[#e4e4e7] transition">
                      Monitor
                    </Link>
                  </div>
                </div>

                {transferFromTable && (
                  <div className="mb-4 bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between text-xs text-blue-800 font-semibold">
                    <span>Moving Table {transferFromTable.tableNumber} — tap a vacant table to transfer.</span>
                    <button onClick={() => setTransferFromTable(null)} className="text-blue-600 hover:text-blue-900 font-bold">Cancel</button>
                  </div>
                )}
                {tableActionError && (
                  <div className="mb-4 bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-700 font-bold">{tableActionError}</div>
                )}

                {/* Section tabs */}
                <div className="flex gap-2 overflow-x-auto pb-3 border-b border-[#f4f4f5] mb-6">
                  {sections.map((section) => (
                    <button
                      key={section}
                      onClick={() => setSelectedSection(section)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                        selectedSection === section
                          ? "bg-[#18181b] text-white shadow-sm"
                          : "bg-[#f4f4f6] text-[#71717a] hover:text-[#18181b]"
                      }`}
                    >
                      {section}
                    </button>
                  ))}
                </div>

                {/* Tables Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredTables.map((table) => {
                    let statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    let badgeLabel = "Vacant";

                    if (table.status === "BILLING") {
                      statusBadge = "bg-blue-50 text-blue-700 border-blue-200";
                      badgeLabel = "Billing";
                    } else if (table.status === "DIRTY") {
                      statusBadge = "bg-amber-50 text-amber-700 border-amber-200";
                      badgeLabel = "Dirty";
                    } else if (table.status === "OCCUPIED" && table.kitchenStage === "READY") {
                      statusBadge = "bg-amber-50 text-amber-700 border-amber-200 animate-pulse";
                      badgeLabel = "Ready to Serve";
                    } else if (table.status === "OCCUPIED" && table.kitchenStage === "SERVED") {
                      statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200";
                      badgeLabel = "Served";
                    } else if (table.status === "OCCUPIED" && (table.kitchenStage === "QUEUED" || table.kitchenStage === "COOKING")) {
                      statusBadge = "bg-rose-50 text-rose-700 border-rose-200";
                      badgeLabel = table.kitchenStage === "COOKING" ? "Cooking" : "Kitchen";
                    } else if (table.status === "OCCUPIED") {
                      statusBadge = "bg-rose-50 text-rose-700 border-rose-200";
                      badgeLabel = "Running";
                    }

                    const isMergeSelected = mergeSourceIds.includes(table.id);

                    return (
                      <div
                        key={table.id}
                        data-table-id={table.tableNumber}
                        data-status={table.status}
                        data-table-uuid={table.id}
                        onClick={() => {
                          if (mergeMode) toggleMergeSource(table.id);
                        }}
                        className={`bg-white border border-[#f4f4f5] rounded-3xl p-5 flex flex-col justify-between h-auto min-h-40 transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 relative overflow-hidden group ${
                          isMergeSelected ? "ring-2 ring-[#18181b]" : ""
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-2xl font-black tracking-tight text-[#18181b]">T-{table.tableNumber}</span>
                            <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${statusBadge}`}>
                              {badgeLabel}
                            </span>
                          </div>
                          <span className="text-xs text-[#71717a] font-medium mt-1 block">Capacity: {table.capacity} Pax</span>
                          {table.mergedWith && table.mergedWith.length > 1 && (
                            <span className="text-[10px] text-indigo-600 mt-0.5 block font-bold">
                              Merged {table.mergedWith.join(" + ")}
                            </span>
                          )}
                        </div>

                        {mergeMode ? (
                          <div className="mt-auto pt-3 z-10 flex flex-col gap-1">
                            <span className="text-[10px] text-center text-[#71717a] font-bold">
                              {isMergeSelected ? "✓ Selected (Source)" : "Tap to select / target"}
                            </span>
                            {mergeSourceIds.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  completeMerge(table.id);
                                }}
                                className="w-full bg-[#18181b] hover:bg-[#27272a] text-white rounded-full py-2 text-[11px] font-bold transition shadow-sm"
                              >
                                Merge into T-{table.tableNumber}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 mt-auto pt-3 z-10">
                            {table.status === "VACANT" && transferFromTable && (
                              <button
                                onClick={() => completeTransfer(table.id)}
                                className="w-full bg-[#18181b] hover:bg-[#27272a] text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
                              >
                                Move T-{transferFromTable.tableNumber} Here
                              </button>
                            )}
                            {table.status === "VACANT" && !transferFromTable && (
                              <button
                                onClick={() => openNewOrder(table)}
                                className="new-order-btn w-full bg-[#18181b] hover:bg-[#27272a] text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
                              >
                                + New Order
                              </button>
                            )}
                            {table.status === "OCCUPIED" && (
                              <>
                                {table.kitchenStage === "READY" && (
                                  <button
                                    onClick={() => serveTable(table)}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
                                  >
                                    Serve Dishes
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setCoversCount(table.capacity || 2);
                                    openManageTable(table);
                                  }}
                                  className="w-full bg-[#18181b] hover:bg-[#27272a] text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
                                >
                                  {table.kitchenStage === "SERVED" ? "Add Dishes / Running" : "Manage Order"}
                                </button>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => startTransfer(table)}
                                    className="flex-1 bg-[#f4f4f6] hover:bg-[#e4e4e7] text-[#18181b] rounded-full py-1.5 text-[11px] font-bold transition"
                                  >
                                    Move
                                  </button>
                                  <button
                                    onClick={() => openBill(table)}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-1.5 text-[11px] font-bold transition shadow-sm"
                                  >
                                    Bill
                                  </button>
                                  <button
                                    onClick={() => updateTableStatus(table.id, "VACANT")}
                                    className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-full py-1.5 text-[11px] font-bold transition"
                                  >
                                    Vacate
                                  </button>
                                </div>
                              </>
                            )}
                            {table.status === "BILLING" && (
                              <button
                                onClick={() => openBill(table)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-2.5 text-xs font-bold transition shadow-sm"
                              >
                                Pay & Vacate
                              </button>
                            )}
                            {table.status === "DIRTY" && (
                              <button
                                onClick={() => updateTableStatus(table.id, "VACANT")}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-full py-2.5 text-xs font-bold transition shadow-sm"
                              >
                                Mark Clean
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Live Kitchen Outputs Monitor */}
            <div className="bg-white p-6 rounded-3xl border border-[#f4f4f5] shadow-[0_2px_14px_rgba(0,0,0,0.03)] flex flex-col h-[650px]">
              <div className="mb-4">
                <h2 className="font-black text-lg text-[#18181b] tracking-tight">Live Kitchen Outputs</h2>
                <p className="text-xs text-[#71717a] font-medium">Ready dishes for delivery to dining tables</p>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
                {myKots.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#a1a1aa]">
                    <span className="text-4xl mb-2">🍽️</span>
                    <p className="text-xs font-bold text-[#71717a]">No active food tickets</p>
                    <p className="text-[10px] text-[#a1a1aa] mt-1">New KOTs will update here in real-time</p>
                  </div>
                ) : (
                  myKots.map((kot) => {
                    let badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                    let isReady = false;

                    if (kot.status === "READY") {
                      badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse";
                      isReady = true;
                    } else if (kot.status === "PREPARING") {
                      badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                    }

                    return (
                      <div
                        key={kot.id}
                        className={`bg-[#fafafa] border rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 ${
                          isReady ? "border-emerald-300 shadow-sm" : "border-[#f4f4f5]"
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-black text-xs text-[#18181b]">
                              KOT #{kot.ticketNumber}{kot.tableNumber ? ` · ${kot.tableNumber}` : ""}
                            </span>
                            <span className={`text-[9px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
                              {kot.status}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1.5 pl-1">
                            {kot.kotItems.map((item) => (
                              <div key={item.id} className="flex justify-between text-xs text-[#18181b]">
                                <span className="font-medium">{item.menuItem.name}</span>
                                <span className="font-bold text-emerald-600">x{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {isReady && (
                          <button
                            onClick={() => serveKot(kot.id)}
                            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
                          >
                            Serve to Table
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {detailItem && (
        <div className="fixed inset-0 z-50 bg-[#18181b]/40 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div
            className="bg-white border border-[#f4f4f5] rounded-3xl p-6 w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.12)] text-[#18181b]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${detailItem.isVeg ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                  {detailItem.isVeg ? "VEG" : "NON-VEG"}
                </span>
                <h2 className="font-black text-base text-[#18181b]">{detailItem.name}</h2>
              </div>
              <button onClick={() => setDetailItem(null)} className="text-[#71717a] hover:text-[#18181b] text-xl font-bold w-8 h-8 rounded-full bg-[#f4f4f6] flex items-center justify-center">✕</button>
            </div>

            {detailItem.description && (
              <p className="text-xs text-[#71717a] leading-relaxed mb-4">{detailItem.description}</p>
            )}

            <div className="flex items-center justify-between mb-5">
              <span className="text-xl font-black text-[#18181b]">₹{(detailItem.priceMinor / 100).toFixed(2)}</span>
              {detailItem.isStocked ? (
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{detailItem.stockQty} in stock</span>
              ) : (
                <span className="text-[10px] text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">86'd — unavailable</span>
              )}
            </div>

            <button
              onClick={() => {
                if (detailItem.isStocked) {
                  addToCart(detailItem);
                  setDetailItem(null);
                }
              }}
              disabled={!detailItem.isStocked}
              className="w-full bg-[#18181b] hover:bg-[#27272a] disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa] text-white rounded-full py-3.5 text-xs font-bold transition-all shadow-sm"
            >
              {detailItem.isStocked ? `Add to Cart — ${selectedCourse} ›` : "Unavailable"}
            </button>
          </div>
        </div>
      )}

      {isMoveKotOpen && (
        <MoveKotModal
          tables={tables.map((t) => ({
            id: t.id,
            tableNumber: t.tableNumber,
            section: t.section,
            status: t.status,
            currentOrder: t.currentOrder || null,
          }))}
          onClose={() => setIsMoveKotOpen(false)}
          onSuccess={() => {
            fetchTables();
            fetchKots();
            fetchMyStats();
          }}
        />
      )}

      {showStats && (
        <div className="fixed inset-0 z-50 bg-[#18181b]/40 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowStats(false)}>
          <div className="bg-white border border-[#f4f4f5] rounded-3xl p-6 w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.12)] text-[#18181b]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-black text-lg text-[#18181b]">My Shift Summary</h2>
              <button onClick={() => setShowStats(false)} className="text-[#71717a] hover:text-[#18181b] text-xl font-bold w-8 h-8 rounded-full bg-[#f4f4f6] flex items-center justify-center">✕</button>
            </div>

            {!myStats ? (
              <p className="text-xs text-[#a1a1aa] py-6 text-center">Loading shift metrics...</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-[#18181b]">{myStats.ordersToday}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Orders Taken</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-[#18181b]">{myStats.tablesServed}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Tables Served</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-[#18181b]">{myStats.avgOrderMinutes ?? "—"}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Avg Order Time (min)</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-emerald-600">₹{(Number(myStats.tipsMinor) / 100).toFixed(2)}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Tips Earned</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-[#18181b]">₹{(Number(myStats.serviceChargeMinor || 0) / 100).toFixed(2)}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Service Charge</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5">
                  <div className="text-2xl font-black text-[#18181b]">{myStats.completedOrders}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Settled Orders</div>
                </div>
                <div className="bg-[#f4f4f6] rounded-2xl p-3.5 col-span-2">
                  <div className="text-2xl font-black text-[#18181b]">₹{(Number(myStats.revenueMinor) / 100).toFixed(2)}</div>
                  <div className="text-[10px] text-[#71717a] font-bold mt-1">Total Revenue Handled</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {billTable && (
        <div className="fixed inset-0 z-50 bg-[#18181b]/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-[#f4f4f5] rounded-3xl p-6 w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.12)] text-[#18181b]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-black text-lg text-[#18181b]">Bill — Table {billTable.tableNumber}</h2>
              <button onClick={() => setBillTable(null)} className="text-[#71717a] hover:text-[#18181b] text-xl font-bold w-8 h-8 rounded-full bg-[#f4f4f6] flex items-center justify-center">✕</button>
            </div>

            {loadingBill && <p className="text-xs text-[#71717a] py-6 text-center">Loading live bill details...</p>}

            {!loadingBill && !bill && (
              <div className="bg-[#f4f4f6] border border-[#e4e4e7] rounded-2xl p-5 text-center flex flex-col items-center gap-3">
                <span className="text-3xl">🧾</span>
                <p className="text-xs text-[#71717a]">No active running order or pending bill for Table {billTable.tableNumber}.</p>
                <button
                  onClick={() => {
                    const tbl = billTable;
                    setBillTable(null);
                    openManageTable(tbl);
                  }}
                  className="bg-[#18181b] hover:bg-[#27272a] text-white rounded-full px-5 py-2.5 text-xs font-bold transition-all shadow-sm"
                >
                  Manage / Create Order ›
                </button>
              </div>
            )}

            {bill && (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-[#71717a] flex flex-col gap-1.5 border-b border-[#f4f4f5] pb-3">
                  <div className="flex justify-between"><span>Subtotal</span><span>₹{(Number(bill.subtotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Discount</span><span>-₹{(Number(bill.discountTotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax</span><span>₹{(Number(bill.taxTotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tip</span><span>₹{(Number(bill.tipTotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Service Charge</span><span>₹{(Number(bill.serviceChargeTotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-[#18181b] font-black text-sm"><span>Grand Total</span><span>₹{(Number(bill.grandTotalMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-emerald-600 font-bold"><span>Paid</span><span>₹{(Number(bill.paidMinor) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-rose-600 font-black"><span>Due</span><span>₹{(Number(bill.dueMinor) / 100).toFixed(2)}</span></div>
                </div>

                <div className="flex gap-2 items-end border-b border-[#f4f4f5] pb-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-[#71717a] font-bold">Tip (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tipInput}
                      onChange={(e) => setTipInput(e.target.value)}
                      className="w-full bg-[#f4f4f6] border border-[#e4e4e7] rounded-full px-3 py-1.5 text-xs text-[#18181b] focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-[#71717a] font-bold">Service Chg (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={serviceChargeInput}
                      onChange={(e) => setServiceChargeInput(e.target.value)}
                      className="w-full bg-[#f4f4f6] border border-[#e4e4e7] rounded-full px-3 py-1.5 text-xs text-[#18181b] focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={applyCharges}
                    disabled={savingCharges}
                    className="bg-[#18181b] hover:bg-[#27272a] text-white rounded-full px-4 py-2 text-[11px] font-bold shadow-sm"
                  >
                    {savingCharges ? "..." : "Apply"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    const next = !splitBySeat;
                    setSplitBySeat(next);
                    if (next) loadSeatBills();
                  }}
                  className={`text-[10px] font-bold rounded-full py-1.5 transition ${splitBySeat ? "bg-[#18181b] text-white" : "bg-[#f4f4f6] text-[#71717a]"}`}
                >
                  {splitBySeat ? "Hide Split by Seat" : "Split Bill by Seat"}
                </button>

                {splitBySeat && (
                  <div className="flex flex-col gap-1.5 border-b border-[#f4f4f5] pb-3">
                    {seatBills.length === 0 ? (
                      <p className="text-[10px] text-[#a1a1aa] text-center">No seat numbers tagged on this order's items yet</p>
                    ) : (
                      seatBills.map((s) => {
                        const due = Number(s.subtotalMinor) - Number(s.paidMinor);
                        return (
                          <div key={s.seatNumber ?? "none"} className="flex justify-between items-center text-xs bg-[#f4f4f6] rounded-xl px-3 py-2">
                            <span className="text-[#18181b] font-bold">{s.seatNumber ? `Seat ${s.seatNumber}` : "Unassigned"}</span>
                            <span className="text-[#71717a]">₹{(Number(s.subtotalMinor) / 100).toFixed(2)}</span>
                            {due > 0 ? (
                              <button
                                onClick={() => submitPayment(due, s.seatNumber ?? undefined)}
                                disabled={submittingPayment}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-2.5 py-1 font-bold shadow-sm"
                              >
                                Pay ₹{(due / 100).toFixed(2)}
                              </button>
                            ) : (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">Paid</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {Number(bill.dueMinor) > 0 ? (
                  <>
                    <div className="flex gap-1.5">
                      {(["CASH", "CARD", "UPI"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setPaymentMethod(m)}
                          className={`flex-1 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                            paymentMethod === m ? "bg-[#18181b] text-white shadow-sm" : "bg-[#f4f4f6] text-[#71717a]"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="bg-[#f4f4f6] border border-[#e4e4e7] rounded-full px-4 py-2.5 text-xs text-[#18181b] font-bold focus:outline-none focus:border-[#18181b]"
                    />
                    <button
                      onClick={() => submitPayment()}
                      disabled={submittingPayment}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa] text-white rounded-full py-3.5 text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
                    >
                      {submittingPayment ? "Processing..." : "Take Payment (Full Order) ›"}
                    </button>
                  </>
                ) : (
                  <p className="text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full py-2 text-xs font-bold">Fully Paid — table cleared</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-out Captain Navigation Drawer */}
      <CaptainNavDrawer
        isOpen={isCaptainDrawerOpen}
        onClose={() => setIsCaptainDrawerOpen(false)}
        outletName={me?.outlet?.name || "Main Outlet"}
        stationCode="cp4"
        staffName={me?.name || "Captain"}
        unsuccessfulCount={offlineCount}
        onNewKot={() => {
          setSelectedSection("All");
          setActiveTable(null);
          showPickupNotification("Select a vacant table to log a new KOT.");
        }}
        onOpenUnsuccessfulModal={() => setIsUnsuccessfulModalOpen(true)}
        onOpenCashTipsCalculator={() => setIsCashTipsCalculatorOpen(true)}
        onSyncData={async () => {
          await fetchTables();
          await fetchMenu();
          await fetchKots();
          await flushOfflineQueue();
          showPickupNotification("✅ Tables, menu catalog, and KOT data synchronized!");
        }}
        onUpdateMenu={async () => {
          await fetchMenu();
          showPickupNotification("🍴 Menu catalog updated to latest version!");
        }}
        onOpenServerIpModal={() => setIsServerIpModalOpen(true)}
        onOpenSettings={() => {
          showPickupNotification("⚙️ Captain Station: cp4 | Mode: High-Reliability Local LAN");
        }}
        onLogout={logout}
      />

      {/* Unsuccessful KOT Sync Modal */}
      {isUnsuccessfulModalOpen && (
        <UnsuccessfulKotModal
          queuedKots={offlineQueue.map((q) => ({
            id: q.id,
            tableNumber: q.url.split("/")[2] || "Table",
            itemCount: q.body?.lines?.length || 1,
            createdAt: new Date().toISOString(),
            errorMessage: "Offline LAN Sync Pending",
          }))}
          onClose={() => setIsUnsuccessfulModalOpen(false)}
          onRetryAll={async () => {
            await syncOfflineQueue();
            setIsUnsuccessfulModalOpen(false);
          }}
          onClearAll={() => {
            saveOfflineQueue([]);
            setOfflineCount(0);
            setIsUnsuccessfulModalOpen(false);
          }}
        />
      )}

      {/* LAN Server IP Configuration Modal */}
      {isServerIpModalOpen && (
        <LanServerDiscoveryModal
          onClose={() => setIsServerIpModalOpen(false)}
          onServerConfigured={(ip) => {
            alert(`Configured Local POS Server Endpoint: ${ip}`);
          }}
        />
      )}

      {/* Shift Cash & Tips Reconciliation Calculator */}
      <WaiterCashTipsCalculator
        isOpen={isCashTipsCalculatorOpen}
        onClose={() => setIsCashTipsCalculatorOpen(false)}
      />

      {/* Fast Staff PIN Login Modal */}
      <CaptainPinLoginModal
        isOpen={isPinLoginModalOpen}
        onClose={() => setIsPinLoginModalOpen(false)}
        onSuccess={(user) => {
          alert(`Welcome back, ${user.name}! Shift active.`);
          window.location.reload();
        }}
      />

      {/* Item Customizer Modal */}
      <MenuCustomizerModal
        isOpen={!!customizingItem}
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={(item, custom) => {
          addCustomizedToCart(item, custom);
          setCustomizingItem(null);
        }}
      />

      </div>
    </div>
  );
}
