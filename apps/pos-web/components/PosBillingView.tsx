import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";
import BillSplitModal from "./BillSplitModal";
import MorePaymentModal from "./MorePaymentModal";

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  priceMinor: number;
  isVeg: boolean;
  isStocked?: boolean;
  stockQty?: number;
  description?: string;
}

export interface CartItem {
  cartItemId: string;
  item: MenuItem;
  quantity: number;
  itemTotalMinor: number;
  notes?: string;
  checked?: boolean;
}

interface PosBillingViewProps {
  initialTable?: string;
  initialTableId?: string;
  initialMode?: "DINE_IN" | "DELIVERY" | "PICKUP";
  onBackToTables?: () => void;
}

// Full Reference Dataset matching Hotel Kapila / PetPooja POS Screenshots
const REFERENCE_MENU_CATALOG: MenuItem[] = [
  // Breakfast Items (Exact Screenshot Match)
  { id: "bk_1", name: "(2) Idly (1) Vada", category: "Breakfast", priceMinor: 7000, isVeg: true, isStocked: true },
  { id: "bk_2", name: "(S) Idly", category: "Breakfast", priceMinor: 4000, isVeg: true, isStocked: true },
  { id: "bk_3", name: "(S) Idly (S) Vada", category: "Breakfast", priceMinor: 6000, isVeg: true, isStocked: true },
  { id: "bk_4", name: "(S) Idly (S) Vada Sambar", category: "Breakfast", priceMinor: 6500, isVeg: true, isStocked: true },
  { id: "bk_5", name: "(S) Idly Sambar", category: "Breakfast", priceMinor: 4500, isVeg: true, isStocked: true },
  { id: "bk_6", name: "(S) Vada", category: "Breakfast", priceMinor: 4500, isVeg: true, isStocked: true },
  { id: "bk_7", name: "(S) Vada Sambar", category: "Breakfast", priceMinor: 5000, isVeg: true, isStocked: true },
  { id: "bk_8", name: "70 Mm Dosa", category: "Breakfast", priceMinor: 11000, isVeg: true, isStocked: true },
  { id: "bk_9", name: "Butter Masala Dosa", category: "Breakfast", priceMinor: 9500, isVeg: true, isStocked: true },
  { id: "bk_10", name: "Chitti Pesarattu", category: "Breakfast", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "bk_11", name: "Extra Aloo", category: "Breakfast", priceMinor: 2500, isVeg: true, isStocked: true },
  { id: "bk_12", name: "Extra Poori", category: "Breakfast", priceMinor: 3000, isVeg: true, isStocked: true },
  { id: "bk_13", name: "Ghee Karam Idly", category: "Breakfast", priceMinor: 7500, isVeg: true, isStocked: true },
  { id: "bk_14", name: "Ghee Karvepaaku Podi Dosa", category: "Breakfast", priceMinor: 10500, isVeg: true, isStocked: true },
  { id: "bk_15", name: "Ghee Podi Dosa", category: "Breakfast", priceMinor: 9500, isVeg: true, isStocked: true },
  { id: "bk_16", name: "Ghee Podi Rava Dosa", category: "Breakfast", priceMinor: 11500, isVeg: true, isStocked: true },
  { id: "bk_17", name: "Idly (2)", category: "Breakfast", priceMinor: 5000, isVeg: true, isStocked: true },
  { id: "bk_18", name: "Idly Sambar", category: "Breakfast", priceMinor: 5500, isVeg: true, isStocked: true },
  { id: "bk_19", name: "Masala Dosa", category: "Breakfast", priceMinor: 8000, isVeg: true, isStocked: true },
  { id: "bk_20", name: "Onion Dosa", category: "Breakfast", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "bk_21", name: "Onion Rava Dosa", category: "Breakfast", priceMinor: 10000, isVeg: true, isStocked: true },
  { id: "bk_22", name: "Onion Uttapam", category: "Breakfast", priceMinor: 9000, isVeg: true, isStocked: true },
  { id: "bk_23", name: "Paneer Dosa", category: "Breakfast", priceMinor: 11000, isVeg: true, isStocked: true },
  { id: "bk_24", name: "Paper Dosa", category: "Breakfast", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "bk_25", name: "Pesarattu", category: "Breakfast", priceMinor: 7500, isVeg: true, isStocked: true },
  { id: "bk_26", name: "Plain Dosa", category: "Breakfast", priceMinor: 6500, isVeg: true, isStocked: true },
  { id: "bk_27", name: "Poori", category: "Breakfast", priceMinor: 7000, isVeg: true, isStocked: true },
  { id: "bk_28", name: "Rava Dosa", category: "Breakfast", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "bk_29", name: "Set Dosa", category: "Breakfast", priceMinor: 8000, isVeg: true, isStocked: true },
  { id: "bk_30", name: "Thatte Idly", category: "Breakfast", priceMinor: 6000, isVeg: true, isStocked: true },
  { id: "bk_31", name: "Vada", category: "Breakfast", priceMinor: 5000, isVeg: true, isStocked: true },
  { id: "bk_32", name: "Vada Sambar", category: "Breakfast", priceMinor: 6000, isVeg: true, isStocked: true },

  // Meal Box (Online)
  { id: "mb_1", name: "South Indian Executive Meal Box", category: "Meal Box (Online)", priceMinor: 19900, isVeg: true, isStocked: true },
  { id: "mb_2", name: "North Indian Mini Meal Box", category: "Meal Box (Online)", priceMinor: 18900, isVeg: true, isStocked: true },
  { id: "mb_3", name: "Special Biryani Box (Veg)", category: "Meal Box (Online)", priceMinor: 22000, isVeg: true, isStocked: true },
  { id: "mb_4", name: "Chicken Biryani Combo Box", category: "Meal Box (Online)", priceMinor: 26000, isVeg: false, isStocked: true },
  { id: "mb_5", name: "Paneer Tikka Meal Box", category: "Meal Box (Online)", priceMinor: 24000, isVeg: true, isStocked: true },
  { id: "mb_6", name: "Chinese Combo Meal Box", category: "Meal Box (Online)", priceMinor: 23000, isVeg: true, isStocked: true },

  // Cold Beverage
  { id: "cb_1", name: "Fresh Sweet Lime Soda", category: "Cold Beverage", priceMinor: 6000, isVeg: true, isStocked: true },
  { id: "cb_2", name: "Cold Coffee with Ice Cream", category: "Cold Beverage", priceMinor: 9000, isVeg: true, isStocked: true },
  { id: "cb_3", name: "Watermelon Juice", category: "Cold Beverage", priceMinor: 7000, isVeg: true, isStocked: true },
  { id: "cb_4", name: "Mango Lassi", category: "Cold Beverage", priceMinor: 8000, isVeg: true, isStocked: true },
  { id: "cb_5", name: "Butter Milk (Masala Chaas)", category: "Cold Beverage", priceMinor: 4000, isVeg: true, isStocked: true },
  { id: "cb_6", name: "Fresh Mint Lemonade", category: "Cold Beverage", priceMinor: 5000, isVeg: true, isStocked: true },
  { id: "cb_7", name: "Kesar Badam Thandai", category: "Cold Beverage", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "cb_8", name: "Oreo Chocolate Shake", category: "Cold Beverage", priceMinor: 9500, isVeg: true, isStocked: true },

  // Hot Beverages
  { id: "hb_1", name: "South Indian Filter Coffee", category: "Hot Beverages", priceMinor: 4000, isVeg: true, isStocked: true },
  { id: "hb_2", name: "Special Masala Chai", category: "Hot Beverages", priceMinor: 3500, isVeg: true, isStocked: true },
  { id: "hb_3", name: "Ginger Lemon Green Tea", category: "Hot Beverages", priceMinor: 4500, isVeg: true, isStocked: true },
  { id: "hb_4", name: "Hot Badam Milk", category: "Hot Beverages", priceMinor: 6000, isVeg: true, isStocked: true },
  { id: "hb_5", name: "Cardamom Irani Chai", category: "Hot Beverages", priceMinor: 4000, isVeg: true, isStocked: true },
  { id: "hb_6", name: "Hot Chocolate", category: "Hot Beverages", priceMinor: 7000, isVeg: true, isStocked: true },

  // Soup (Veg)
  { id: "sv_1", name: "Cream of Tomato Soup", category: "Soup(Veg)", priceMinor: 8000, isVeg: true, isStocked: true },
  { id: "sv_2", name: "Veg Hot and Sour Soup", category: "Soup(Veg)", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "sv_3", name: "Sweet Corn Veg Soup", category: "Soup(Veg)", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "sv_4", name: "Veg Manchow Soup", category: "Soup(Veg)", priceMinor: 9000, isVeg: true, isStocked: true },
  { id: "sv_5", name: "Lemon Coriander Veg Soup", category: "Soup(Veg)", priceMinor: 8500, isVeg: true, isStocked: true },
  { id: "sv_6", name: "Cream of Mushroom Soup", category: "Soup(Veg)", priceMinor: 9500, isVeg: true, isStocked: true },

  // Meals
  { id: "m_1", name: "Kapila Special Veg Thali", category: "Meals", priceMinor: 16000, isVeg: true, isStocked: true },
  { id: "m_2", name: "South Indian Full Meals", category: "Meals", priceMinor: 14000, isVeg: true, isStocked: true },
  { id: "m_3", name: "Curd Rice with Pomegranate", category: "Meals", priceMinor: 8000, isVeg: true, isStocked: true },
  { id: "m_4", name: "Sambar Rice with Ghee", category: "Meals", priceMinor: 9000, isVeg: true, isStocked: true },
  { id: "m_5", name: "Andhra Special Meals", category: "Meals", priceMinor: 17000, isVeg: true, isStocked: true },
  { id: "m_6", name: "Mini Executive Lunch", category: "Meals", priceMinor: 12000, isVeg: true, isStocked: true },

  // Soup (Non-Veg)
  { id: "snv_1", name: "Chicken Manchow Soup", category: "Soup(Non-Veg)", priceMinor: 11000, isVeg: false, isStocked: true },
  { id: "snv_2", name: "Chicken Sweet Corn Soup", category: "Soup(Non-Veg)", priceMinor: 11000, isVeg: false, isStocked: true },
  { id: "snv_3", name: "Mutton Bone Marrow Soup (Paya)", category: "Soup(Non-Veg)", priceMinor: 15000, isVeg: false, isStocked: true },
  { id: "snv_4", name: "Chicken Hot & Sour Soup", category: "Soup(Non-Veg)", priceMinor: 11500, isVeg: false, isStocked: true },
  { id: "snv_5", name: "Chicken Clear Soup", category: "Soup(Non-Veg)", priceMinor: 10500, isVeg: false, isStocked: true },
  { id: "snv_6", name: "Mutton Shorba (Special)", category: "Soup(Non-Veg)", priceMinor: 16000, isVeg: false, isStocked: true },

  // Chinese Starters (Veg)
  { id: "csv_1", name: "Veg Manchurian Dry", category: "Chinese Starters (Veg)", priceMinor: 13000, isVeg: true, isStocked: true },
  { id: "csv_2", name: "Chilli Paneer Dry", category: "Chinese Starters (Veg)", priceMinor: 16000, isVeg: true, isStocked: true },
  { id: "csv_3", name: "Crispy Corn Pepper Salt", category: "Chinese Starters (Veg)", priceMinor: 14000, isVeg: true, isStocked: true },
  { id: "csv_4", name: "Baby Corn 65", category: "Chinese Starters (Veg)", priceMinor: 14500, isVeg: true, isStocked: true },
  { id: "csv_5", name: "Veg Spring Rolls (6 Pcs)", category: "Chinese Starters (Veg)", priceMinor: 13500, isVeg: true, isStocked: true },
  { id: "csv_6", name: "Paneer 65 Crispy", category: "Chinese Starters (Veg)", priceMinor: 16500, isVeg: true, isStocked: true },
  { id: "csv_7", name: "Mushroom Chilli Dry", category: "Chinese Starters (Veg)", priceMinor: 15000, isVeg: true, isStocked: true },
  { id: "csv_8", name: "Honey Chilli Potato", category: "Chinese Starters (Veg)", priceMinor: 12500, isVeg: true, isStocked: true },

  // Chinese Starters (Non-Veg)
  { id: "csnv_1", name: "Chilli Chicken Dry", category: "Chinese Starters (Non-Veg)", priceMinor: 18000, isVeg: false, isStocked: true },
  { id: "csnv_2", name: "Chicken 65 Hyderabadi", category: "Chinese Starters (Non-Veg)", priceMinor: 19000, isVeg: false, isStocked: true },
  { id: "csnv_3", name: "Apollo Fish Fry", category: "Chinese Starters (Non-Veg)", priceMinor: 22000, isVeg: false, isStocked: true },
  { id: "csnv_4", name: "Dragon Chicken", category: "Chinese Starters (Non-Veg)", priceMinor: 19500, isVeg: false, isStocked: true },
  { id: "csnv_5", name: "Chicken Lollipop (6 Pcs)", category: "Chinese Starters (Non-Veg)", priceMinor: 21000, isVeg: false, isStocked: true },
  { id: "csnv_6", name: "Pepper Chicken Roast", category: "Chinese Starters (Non-Veg)", priceMinor: 19500, isVeg: false, isStocked: true },
  { id: "csnv_7", name: "Garlic Butter Prawns", category: "Chinese Starters (Non-Veg)", priceMinor: 25000, isVeg: false, isStocked: true },
  { id: "csnv_8", name: "Chicken Majestic", category: "Chinese Starters (Non-Veg)", priceMinor: 20000, isVeg: false, isStocked: true },

  // Tandoori Starters (Veg)
  { id: "tsv_1", name: "Paneer Tikka Angara", category: "Tandoori Starters (Veg)", priceMinor: 18000, isVeg: true, isStocked: true },
  { id: "tsv_2", name: "Malai Broccoli Tikka", category: "Tandoori Starters (Veg)", priceMinor: 19000, isVeg: true, isStocked: true },
  { id: "tsv_3", name: "Tandoori Mushroom Tikka", category: "Tandoori Starters (Veg)", priceMinor: 16000, isVeg: true, isStocked: true },
  { id: "tsv_4", name: "Veg Seekh Kabab", category: "Tandoori Starters (Veg)", priceMinor: 15000, isVeg: true, isStocked: true },
  { id: "tsv_5", name: "Haryali Paneer Tikka", category: "Tandoori Starters (Veg)", priceMinor: 18500, isVeg: true, isStocked: true },
  { id: "tsv_6", name: "Tandoori Stuffed Aloo", category: "Tandoori Starters (Veg)", priceMinor: 14000, isVeg: true, isStocked: true },

  // Tandoori Starters (Non-Veg)
  { id: "tsnv_1", name: "Tandoori Murgh (Full)", category: "Tandoori Starters (Non-Veg)", priceMinor: 34000, isVeg: false, isStocked: true },
  { id: "tsnv_2", name: "Murgh Tikka (6 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 21000, isVeg: false, isStocked: true },
  { id: "tsnv_3", name: "Tangdi Kabab (4 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 23000, isVeg: false, isStocked: true },
  { id: "tsnv_4", name: "Reshmi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 22000, isVeg: false, isStocked: true },
  { id: "tsnv_5", name: "Mutton Seekh Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 26000, isVeg: false, isStocked: true },
  { id: "tsnv_6", name: "Fish Tikka (Tandoori)", category: "Tandoori Starters (Non-Veg)", priceMinor: 24000, isVeg: false, isStocked: true },
  { id: "tsnv_7", name: "Pahadi Chicken Kabab", category: "Tandoori Starters (Non-Veg)", priceMinor: 21500, isVeg: false, isStocked: true },
  { id: "tsnv_8", name: "Kalmi Kabab (3 Pcs)", category: "Tandoori Starters (Non-Veg)", priceMinor: 23500, isVeg: false, isStocked: true },

  // Curries (Veg)
  { id: "cv_1", name: "Paneer Butter Masala", category: "Curries (Veg)", priceMinor: 16000, isVeg: true, isStocked: true },
  { id: "cv_2", name: "Kaju Curry (Special)", category: "Curries (Veg)", priceMinor: 20000, isVeg: true, isStocked: true },
  { id: "cv_3", name: "Dal Tadka Desi Ghee", category: "Curries (Veg)", priceMinor: 12000, isVeg: true, isStocked: true },
  { id: "cv_4", name: "Methi Chaman", category: "Curries (Veg)", priceMinor: 17000, isVeg: true, isStocked: true },
  { id: "cv_5", name: "Kadai Paneer", category: "Curries (Veg)", priceMinor: 16500, isVeg: true, isStocked: true },
  { id: "cv_6", name: "Dal Makhani (Slow Cooked)", category: "Curries (Veg)", priceMinor: 15000, isVeg: true, isStocked: true },
  { id: "cv_7", name: "Mix Veg Curry", category: "Curries (Veg)", priceMinor: 13500, isVeg: true, isStocked: true },
  { id: "cv_8", name: "Palak Paneer", category: "Curries (Veg)", priceMinor: 16000, isVeg: true, isStocked: true },

  // Curries (Non-Veg)
  { id: "cnv_1", name: "Butter Chicken Delhi Style", category: "Curries (Non-Veg)", priceMinor: 22000, isVeg: false, isStocked: true },
  { id: "cnv_2", name: "Telangana Style Chicken Curry", category: "Curries (Non-Veg)", priceMinor: 21000, isVeg: false, isStocked: true },
  { id: "cnv_3", name: "Mutton Rogan Josh", category: "Curries (Non-Veg)", priceMinor: 28000, isVeg: false, isStocked: true },
  { id: "cnv_4", name: "Chicken Tikka Masala", category: "Curries (Non-Veg)", priceMinor: 23000, isVeg: false, isStocked: true },
  { id: "cnv_5", name: "Chettinad Chicken Curry", category: "Curries (Non-Veg)", priceMinor: 22000, isVeg: false, isStocked: true },
  { id: "cnv_6", name: "Andhra Mutton Curry", category: "Curries (Non-Veg)", priceMinor: 29000, isVeg: false, isStocked: true },
  { id: "cnv_7", name: "Nellore Fish Curry", category: "Curries (Non-Veg)", priceMinor: 24000, isVeg: false, isStocked: true },
  { id: "cnv_8", name: "Egg Masala Curry (2 Eggs)", category: "Curries (Non-Veg)", priceMinor: 14000, isVeg: false, isStocked: true },

  // Roti
  { id: "r_1", name: "Butter Naan", category: "Roti", priceMinor: 4500, isVeg: true, isStocked: true },
  { id: "r_2", name: "Garlic Butter Naan", category: "Roti", priceMinor: 5500, isVeg: true, isStocked: true },
  { id: "r_3", name: "Tandoori Roti (Butter)", category: "Roti", priceMinor: 3000, isVeg: true, isStocked: true },
  { id: "r_4", name: "Rumali Roti", category: "Roti", priceMinor: 3500, isVeg: true, isStocked: true },
  { id: "r_5", name: "Plain Tandoori Roti", category: "Roti", priceMinor: 2500, isVeg: true, isStocked: true },
  { id: "r_6", name: "Laccha Paratha", category: "Roti", priceMinor: 5000, isVeg: true, isStocked: true },
  { id: "r_7", name: "Amritsari Kulcha", category: "Roti", priceMinor: 6000, isVeg: true, isStocked: true },
  { id: "r_8", name: "Cheese Garlic Naan", category: "Roti", priceMinor: 7500, isVeg: true, isStocked: true },

  // Noodles (Veg)
  { id: "nv_1", name: "Veg Hakka Noodles", category: "Noodles (Veg)", priceMinor: 14000, isVeg: true, isStocked: true },
  { id: "nv_2", name: "Veg Schezwan Noodles", category: "Noodles (Veg)", priceMinor: 15000, isVeg: true, isStocked: true },
  { id: "nv_3", name: "Chilli Garlic Veg Noodles", category: "Noodles (Veg)", priceMinor: 15500, isVeg: true, isStocked: true },
  { id: "nv_4", name: "Singapore Veg Noodles", category: "Noodles (Veg)", priceMinor: 16000, isVeg: true, isStocked: true },
  { id: "nv_5", name: "Burnt Garlic Veg Noodles", category: "Noodles (Veg)", priceMinor: 15000, isVeg: true, isStocked: true },
  { id: "nv_6", name: "Paneer Hakka Noodles", category: "Noodles (Veg)", priceMinor: 17000, isVeg: true, isStocked: true },
];

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

const DEFAULT_CAPTAINS = [
  "cp1 (Captain - Ramesh)",
  "cp2 (Captain - Suresh)",
  "cp3 (Captain - Mahesh)",
  "cp4 (Captain - Ganesh)",
  "cp5 (Captain - Rajesh)",
];

export default function PosBillingView({
  initialTable = "A1",
  initialTableId = "",
  initialMode = "DINE_IN",
  onBackToTables,
}: PosBillingViewProps) {
  const router = useRouter();
  const [orderMode, setOrderMode] = useState<"DINE_IN" | "DELIVERY" | "PICKUP">(initialMode);
  const [selectedCategory, setSelectedCategory] = useState<string>("Breakfast");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalog, setCatalog] = useState<MenuItem[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("kapmeta_stock_overrides") : null;
      if (raw) {
        const overrides = JSON.parse(raw);
        return REFERENCE_MENU_CATALOG.map((it) => ({
          ...it,
          isStocked: overrides[it.id] !== undefined ? overrides[it.id] : it.isStocked,
        }));
      }
    } catch {}
    return REFERENCE_MENU_CATALOG;
  });
  const [categories, setCategories] = useState<string[]>(ORDER_CATEGORIES);

  // Cart & Order State
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [tableSection, setTableSection] = useState("AC");
  const [coversCount, setCoversCount] = useState(2);
  const [waiterName, setWaiterName] = useState("cp1 (Captain)");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Inline Customer & Order Metadata State
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerLocality, setCustomerLocality] = useState("");
  const [customerFormErrors, setCustomerFormErrors] = useState<{
    mobile?: string;
    name?: string;
    address?: string;
  }>({});
  const [activeMetaTab, setActiveMetaTab] = useState<"CUSTOMER" | "NOTES" | "ADD" | null>(null);
  const [showCustomerFields, setShowCustomerFields] = useState(false);

  // Order Wise Comments State & Modal
  const [showOrderCommentsModal, setShowOrderCommentsModal] = useState(false);
  const [orderWiseComment, setOrderWiseComment] = useState("");
  const [tempComment, setTempComment] = useState("");

  // Staff / Captain Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignedCaptain, setAssignedCaptain] = useState("cp1 (Captain)");
  const [captainsList, setCaptainsList] = useState<string[]>(DEFAULT_CAPTAINS);

  // Advance Order Scheduling State
  const [isAdvanceOrder, setIsAdvanceOrder] = useState(false);
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceTime, setAdvanceTime] = useState("");
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);

  // Payment & Settlement State
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [isPaidChecked, setIsPaidChecked] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [showMorePaymentModal, setShowMorePaymentModal] = useState(false);
  const [roomServiceDetails, setRoomServiceDetails] = useState<{ roomNumber?: string; guestName?: string } | null>(null);
  const [customPaymentTypes, setCustomPaymentTypes] = useState<Array<{ id: string; label: string; isOnline?: boolean }>>([
    { id: "pt_cash", label: "Cash", isOnline: false },
    { id: "pt_card", label: "Card", isOnline: false },
    { id: "pt_upi", label: "UPI", isOnline: true },
    { id: "pt_room", label: "Other (Room Service)", isOnline: false },
  ]);
  const [processingOrder, setProcessingOrder] = useState(false);

  // Load live menu catalog & staff if available
  useEffect(() => {
    loadLiveMenu();
    loadLiveWaiters();

    const handleAvailabilityChange = (e: any) => {
      if (e.detail && e.detail.itemId !== undefined) {
        setCatalog((prev) =>
          prev.map((it) =>
            it.id === e.detail.itemId
              ? { ...it, isStocked: e.detail.isStocked, stockQty: e.detail.stockQty ?? 100 }
              : it
          )
        );
      }
    };

    window.addEventListener("item-availability-changed", handleAvailabilityChange);

    return () => {
      window.removeEventListener("item-availability-changed", handleAvailabilityChange);
    };
  }, []);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [loadingTableOrder, setLoadingTableOrder] = useState(false);
  const loadedTableRef = React.useRef<string | null>(null);
  const isTableLoadedRef = React.useRef<boolean>(false);

  // Sync mode changes with customer fields visibility
  useEffect(() => {
    if (orderMode === "DINE_IN") {
      setShowCustomerFields(false);
    } else {
      setShowCustomerFields(true);
    }
  }, [orderMode]);

  // Load active table order when table is opened
  useEffect(() => {
    setTableNumber(initialTable);
    setTableSection(initialTable.toUpperCase().startsWith("A") ? "AC" : "Non AC");
    if (orderMode === "DINE_IN" && initialTable && initialTable !== "Direct") {
      loadLiveTableOrder();
    } else {
      isTableLoadedRef.current = true;
      loadedTableRef.current = initialTable;
      setActiveOrderId(null);
      setCart([]);
    }
  }, [initialTable, initialTableId, orderMode]);

  const loadDraft = (targetTable: string) => {
    if (typeof window !== "undefined") {
      try {
        const keysToTry = Array.from(
          new Set([
            `kapmeta_draft_${targetTable}`,
            `kapmeta_draft_${targetTable.toLowerCase()}`,
            `kapmeta_draft_${targetTable.toUpperCase()}`,
            initialTable ? `kapmeta_draft_${initialTable}` : "",
            initialTable ? `kapmeta_draft_${initialTable.toLowerCase()}` : "",
            initialTable ? `kapmeta_draft_${initialTable.toUpperCase()}` : "",
            initialTableId ? `kapmeta_draft_${initialTableId}` : "",
            initialTableId ? `kapmeta_draft_${initialTableId.toLowerCase()}` : "",
            initialTableId ? `kapmeta_draft_${initialTableId.toUpperCase()}` : "",
          ].filter(Boolean))
        );

        for (const k of keysToTry) {
          const draft = localStorage.getItem(k);
          if (draft) {
            const parsed = JSON.parse(draft);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const mapped: CartItem[] = parsed.map((c: any) => ({
                cartItemId: c.cartItemId || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                item: {
                  id: c.item?.id || c.menuItemId || c.id || "item",
                  name: c.item?.name || c.menuItemName || c.name || "Item",
                  category: c.item?.category || c.category || "Main",
                  priceMinor: Number(c.item?.priceMinor || c.priceMinor || c.unitPriceMinor || 0),
                  isVeg: c.item?.isVeg ?? c.isVeg ?? true,
                  isStocked: true,
                },
                quantity: Number(c.quantity || 1),
                itemTotalMinor: Number(
                  c.itemTotalMinor || (c.item?.priceMinor ? Number(c.item.priceMinor) * Number(c.quantity || 1) : 0)
                ),
                notes: c.notes || "",
                checked: c.checked ?? true,
              }));
              setCart(mapped);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load draft for table", err);
      }
    }
    setCart([]);
  };

  const loadLiveTableOrder = async () => {
    const targetTable = initialTableId || initialTable;
    if (!targetTable) return;
    isTableLoadedRef.current = false;
    loadedTableRef.current = targetTable;
    setLoadingTableOrder(true);
    setCart([]);
    setActiveOrderId(null);
    try {
      const res = await authedFetch(`/orders/by-table/${encodeURIComponent(targetTable)}/active`);
      if (res.ok) {
        const order = await res.json();
        if (order && order.id && order.items && Array.isArray(order.items) && order.items.length > 0) {
          setActiveOrderId(order.id);
          if (order.covers) setCoversCount(order.covers);
          if (order.waiterName) setWaiterName(order.waiterName);
          if (order.customerName) setCustomerName(order.customerName);
          const mappedCart: CartItem[] = order.items.map((it: any) => ({
            cartItemId: it.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            item: {
              id: it.menuItemId,
              name: it.menuItemName || it.menuItem?.name || "Menu Item",
              category: it.category || "Main",
              priceMinor: Number(it.unitPriceMinor || it.unitPrice || 0),
              isVeg: it.isVeg ?? true,
              isStocked: true,
            },
            quantity: it.quantity || 1,
            itemTotalMinor: Number(it.subtotalMinor || it.subtotal || (Number(it.unitPriceMinor || 0) * (it.quantity || 1))),
            notes: it.notes,
            checked: true,
          }));
          setCart(mappedCart);
        } else {
          setActiveOrderId(null);
          loadDraft(targetTable);
        }
      } else {
        setActiveOrderId(null);
        loadDraft(targetTable);
      }
    } catch (e) {
      console.warn("No active live order found for table", e);
      setActiveOrderId(null);
      loadDraft(targetTable);
    } finally {
      setLoadingTableOrder(false);
      isTableLoadedRef.current = true;
    }
  };

  // Sync draft cart to localStorage ONLY when loaded and user is editing this specific table
  useEffect(() => {
    const targetTable = initialTableId || initialTable;
    if (
      isTableLoadedRef.current &&
      loadedTableRef.current === targetTable &&
      orderMode === "DINE_IN" &&
      targetTable &&
      targetTable !== "Direct" &&
      !activeOrderId
    ) {
      const keysToSync = Array.from(
        new Set([
          `kapmeta_draft_${targetTable}`,
          initialTable ? `kapmeta_draft_${initialTable}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId}` : "",
        ].filter(Boolean))
      );

      if (cart.length > 0) {
        keysToSync.forEach((k) => localStorage.setItem(k, JSON.stringify(cart)));
      } else {
        keysToSync.forEach((k) => localStorage.removeItem(k));
      }
    }
  }, [cart, initialTable, initialTableId, activeOrderId, orderMode]);

  const loadLiveMenu = async () => {
    try {
      const res = await authedFetch("/menu/availability");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const rawOverrides = typeof window !== "undefined" ? localStorage.getItem("kapmeta_stock_overrides") : null;
          const overrides = rawOverrides ? JSON.parse(rawOverrides) : {};
          const items: MenuItem[] = data.map((it: any) => ({
            id: it.id,
            name: it.name,
            category: it.categoryName || it.category?.name || "Breakfast",
            priceMinor: Number(it.priceMinor || 0),
            isVeg: it.isVeg ?? true,
            isStocked: overrides[it.id] !== undefined
              ? overrides[it.id]
              : (it.availability ? it.availability.isStocked : true),
            stockQty: it.availability ? it.availability.stockQty : 100,
          }));

          setCatalog(items);
          const dynamicCats = Array.from(new Set(items.map((i) => i.category))).filter(Boolean);
          if (dynamicCats.length > 0) {
            setCategories(dynamicCats);
            if (!dynamicCats.includes(selectedCategory)) {
              setSelectedCategory(dynamicCats[0]);
            }
          }
        }
      }
    } catch {
      // Gracefully retain reference catalog
    }
  };

  const loadLiveWaiters = async () => {
    try {
      const res = await authedFetch("/waiters/active");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const names = data.map((w: any) => `${w.name} (Captain)`);
          setCaptainsList(names);
        }
      }
    } catch {
      // Retain DEFAULT_CAPTAINS
    }
  };

  const addToCart = (item: MenuItem) => {
    if (item.isStocked === false) {
      alert(`${item.name} is currently Out of Stock (86'd).`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((c) => c.item.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const nextQty = updated[existingIndex].quantity + 1;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: nextQty,
          itemTotalMinor: nextQty * item.priceMinor,
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartItemId: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          item,
          quantity: 1,
          itemTotalMinor: item.priceMinor,
          checked: true,
        },
      ];
    });
  };

  const updateCartItemQty = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.cartItemId === cartItemId) {
            const nextQty = c.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...c,
              quantity: nextQty,
              itemTotalMinor: nextQty * c.item.priceMinor,
            };
          }
          return c;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const toggleCheckItem = (cartItemId: string) => {
    // Unchecking removes the item completely from the right cart list and resets the menu badge to 0
    setCart((prev) => prev.filter((c) => c.cartItemId !== cartItemId));
  };

  const toggleCheckAllItems = () => {
    // Toggle check all / clear all items from the ticket
    if (cart.length === 0) return;
    setCart([]);
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (confirm("Are you sure you want to clear this cart ticket?")) {
      setCart([]);
      setOrderWiseComment("");
    }
  };

  const clearCustomerDetails = () => {
    setCustomerMobile("");
    setCustomerName("");
    setCustomerAddress("");
    setCustomerLocality("");
  };

  // Pricing calculations based on checked items
  const activeCartItems = useMemo(() => cart.filter((it) => it.checked !== false), [cart]);
  const subtotalMinor = useMemo(() => activeCartItems.reduce((sum, it) => sum + it.itemTotalMinor, 0), [activeCartItems]);
  const taxMinor = useMemo(() => Math.round(subtotalMinor * 0.05), [subtotalMinor]); // 5% GST
  const grandTotalMinor = subtotalMinor + taxMinor;
  const grandTotalRupees = (grandTotalMinor / 100).toFixed(0);

  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesCategory && matchesSearch;
    });
  }, [catalog, selectedCategory, searchQuery]);

  const validateCustomerForm = (): boolean => {
    if (!showCustomerFields) return true;

    const errors: { mobile?: string; name?: string; address?: string } = {};
    const cleanMobile = customerMobile.replace(/\D/g, "");

    if (orderMode === "DELIVERY") {
      if (!cleanMobile) {
        errors.mobile = "Mobile number is required for Delivery";
      } else if (cleanMobile.length < 10) {
        errors.mobile = "Enter a valid 10-digit mobile number";
      }

      if (!customerName.trim()) {
        errors.name = "Customer name is required for Delivery";
      }

      if (!customerAddress.trim()) {
        errors.address = "Delivery address is required";
      }
    } else if (orderMode === "PICKUP") {
      if (!cleanMobile) {
        errors.mobile = "Mobile number is required for Pick Up";
      } else if (cleanMobile.length < 10) {
        errors.mobile = "Enter a valid 10-digit mobile number";
      }

      if (!customerName.trim()) {
        errors.name = "Customer name is required for Pick Up";
      }
    }

    setCustomerFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = errors.mobile || errors.name || errors.address;
      alert(`⚠️ Please complete customer details:\n\n• ${firstError}`);
      return false;
    }

    return true;
  };

  const handlePrintAndEBill = async () => {
    if (activeCartItems.length === 0) {
      alert("Please check at least one item from the menu to punch and print the bill.");
      return;
    }
    if (!validateCustomerForm()) {
      return;
    }
    setProcessingOrder(true);
    try {
      if (activeOrderId) {
        // Record payment for the active order
        await authedFetch(`/orders/${activeOrderId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountMinor: grandTotalMinor,
            method: paymentMethod,
          }),
        }).catch(() => {});

        // Transition order status to COMPLETED
        await authedFetch(`/orders/${activeOrderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus: "COMPLETED" }),
        }).catch(() => {});

        // Also vacate the dining table if Dine-In
        if (orderMode === "DINE_IN") {
          const targetTable = initialTableId || tableNumber;
          if (targetTable) {
            await authedFetch(`/tables/${encodeURIComponent(targetTable)}/vacate`, {
              method: "POST",
            }).catch(() => {});
          }
        }
      } else {
        const payload = {
          orderType: orderMode,
          tableNumber: orderMode === "DINE_IN" ? tableNumber : null,
          diningTableId: orderMode === "DINE_IN" ? initialTableId || null : null,
          covers: coversCount,
          waiterName,
          customerName: customerName || null,
          customerPhone: customerMobile || null,
          customerAddress: customerAddress || null,
          customerLocality: customerLocality || null,
          orderComments: orderWiseComment || null,
          kitchenNotes: orderWiseComment || null,
          paymentMethod,
          isPaid: isPaidChecked,
          isAdvanceOrder,
          advanceSchedule: isAdvanceOrder ? { date: advanceDate, time: advanceTime } : null,
          lines: activeCartItems.map((c) => ({
            menuItemId: c.item.id,
            quantity: c.quantity,
            unitPriceMinor: c.item.priceMinor,
            notes: c.notes || null,
          })),
          items: activeCartItems.map((c) => ({
            menuItemId: c.item.id,
            quantity: c.quantity,
            unitPriceMinor: c.item.priceMinor,
            notes: c.notes || null,
          })),
          terminalNumber: "TERM-01",
          idempotencyKey: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          subtotalMinor,
          taxTotalMinor: taxMinor,
          grandTotalMinor,
        };

        const res = await authedFetch("/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          alert(`Failed to create order: ${errData?.error || res.statusText || "Server error"}`);
          return;
        }

        const orderData = await res.json().catch(() => null);
        const generatedBillNo = orderData?.orderNumber || "";
        const generatedKotNo = orderData?.kotTicketNumber || "";

        if (orderMode === "DINE_IN" && isPaidChecked) {
          const targetTable = initialTableId || tableNumber;
          if (targetTable) {
            await authedFetch(`/tables/${encodeURIComponent(targetTable)}/vacate`, {
              method: "POST",
            }).catch(() => {});
          }
        }

        alert(
          `✓ Tax Invoice & E-Bill Dispatched!\n\n${generatedBillNo ? `Bill No: #${generatedBillNo}\n` : ""}${generatedKotNo ? `KOT No: #${generatedKotNo}\n` : ""}Order Mode: ${orderMode}\n${orderMode === "DINE_IN" ? `Table: ${tableNumber} (${tableSection})\n` : ""}Assigned: ${waiterName}\n${orderWiseComment ? `Comments: "${orderWiseComment}"\n` : ""}${customerMobile ? `Customer: ${customerName || "Guest"} (${customerMobile})\n` : ""}${isAdvanceOrder ? `Advance Scheduled: ${advanceDate} ${advanceTime}\n` : ""}Items: ${activeCartItems.length} items\nTotal: ₹${(grandTotalMinor / 100).toFixed(2)}\nPayment: ${paymentMethod} (${isPaidChecked ? "PAID" : "UNPAID"})`
        );
      }

      setCart([]);
      setActiveOrderId(null);
      setOrderWiseComment("");
      setIsAdvanceOrder(false);
      if (orderMode === "DINE_IN") {
        const keysToClear = [
          initialTable ? `kapmeta_draft_${initialTable}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toLowerCase()}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toUpperCase()}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId.toLowerCase()}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber.toLowerCase()}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber.toUpperCase()}` : "",
        ].filter(Boolean);
        keysToClear.forEach((k) => {
          try { localStorage.removeItem(k); } catch {}
        });
      }
      if (onBackToTables) onBackToTables();
    } finally {
      setProcessingOrder(false);
    }
  };

  const handleFireKot = async () => {
    if (activeCartItems.length === 0) {
      alert("Please check at least one item from the menu to generate and fire KOT.");
      return;
    }
    setProcessingOrder(true);
    try {
      const payload = {
        orderType: orderMode,
        tableNumber: orderMode === "DINE_IN" ? tableNumber : null,
        diningTableId: orderMode === "DINE_IN" ? initialTableId || null : null,
        covers: coversCount,
        waiterName,
        customerName: customerName || null,
        customerPhone: customerMobile || null,
        customerAddress: customerAddress || null,
        customerLocality: customerLocality || null,
        orderComments: orderWiseComment || null,
        kitchenNotes: orderWiseComment || null,
        paymentMethod,
        isPaid: false,
        isAdvanceOrder,
        advanceSchedule: isAdvanceOrder ? { date: advanceDate, time: advanceTime } : null,
        items: activeCartItems.map((c) => ({
          menuItemId: c.item.id,
          quantity: c.quantity,
          unitPriceMinor: c.item.priceMinor,
          notes: c.notes || null,
        })),
        subtotalMinor,
        taxTotalMinor: taxMinor,
        grandTotalMinor,
      };

      await authedFetch("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }).catch(() => {});

      alert(
        `✓ KOT Generated & Fired to Kitchen!\n\n${orderMode === "DINE_IN" ? `Table: ${tableNumber} (${tableSection})\n` : ""}Items: ${activeCartItems.length} items\nAssigned: ${waiterName}\nStatus: Active in Kitchen KDS`
      );

      setCart((prev) => prev.filter((c) => c.checked === false));
      setOrderWiseComment("");
      if (orderMode === "DINE_IN") {
        const keysToClear = [
          initialTable ? `kapmeta_draft_${initialTable}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toLowerCase()}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toUpperCase()}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId.toLowerCase()}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber.toLowerCase()}` : "",
        ].filter(Boolean);
        keysToClear.forEach((k) => localStorage.removeItem(k));
      }
      if (onBackToTables) onBackToTables();
    } catch {
      alert(`✓ KOT Dispatched for Table ${tableNumber}!`);
      setCart((prev) => prev.filter((c) => c.checked === false));
      setOrderWiseComment("");
      if (orderMode === "DINE_IN") {
        const keysToClear = [
          initialTable ? `kapmeta_draft_${initialTable}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toLowerCase()}` : "",
          initialTable ? `kapmeta_draft_${initialTable.toUpperCase()}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId}` : "",
          initialTableId ? `kapmeta_draft_${initialTableId.toLowerCase()}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber}` : "",
          tableNumber ? `kapmeta_draft_${tableNumber.toLowerCase()}` : "",
        ].filter(Boolean);
        keysToClear.forEach((k) => localStorage.removeItem(k));
      }
      if (onBackToTables) onBackToTables();
    } finally {
      setProcessingOrder(false);
    }
  };

  return (
    <div className="petpooja-billing-screen-root" data-testid="order-entry-screen">
      {/* 3-COLUMN WORKSPACE: Categories (Left), Menu Items Grid (Center), Cart & Settlement (Right) */}
      <div className="petpooja-pos-layout-grid">
        
        {/* ============================================================ */}
        {/* COLUMN 1: LEFT CATEGORY RAIL                                 */}
        {/* ============================================================ */}
        <aside className="petpooja-category-rail">
          <div className="category-rail-scroll">
            {onBackToTables && (
              <button
                type="button"
                className="category-nav-tile back-to-tables-tile"
                onClick={onBackToTables}
                title="Return to Table Floor Plan"
              >
                <span className="category-tile-label">« Tables</span>
              </button>
            )}
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`category-nav-tile ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <span className="category-tile-label">{cat}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ============================================================ */}
        {/* COLUMN 2: CENTER MENU ITEM MATRIX & SEARCH                   */}
        {/* ============================================================ */}
        <main className="petpooja-menu-matrix-panel">
          {/* Top Search Item Input */}
          <div className="item-search-bar-row">
            <div className="item-search-input-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search item"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="matrix-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-x"
                  onClick={() => setSearchQuery("")}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 4-Column Item Card Grid */}
          <div className="item-tiles-matrix-scroll">
            {filteredItems.length === 0 ? (
              <div className="no-search-results">
                <div className="empty-search-icon">🔍</div>
                <div className="empty-search-text">No items found matching &quot;{searchQuery}&quot;</div>
              </div>
            ) : (
              <div className="petpooja-items-grid">
                {filteredItems.map((item) => {
                  const inCartItem = cart.find((c) => c.item.id === item.id);
                  const qtyInCart = inCartItem?.quantity || 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`petpooja-item-tile ${item.isVeg ? "is-veg" : "is-nonveg"} ${qtyInCart > 0 ? "in-cart" : ""} ${item.isStocked === false ? "is-out-of-stock" : ""}`}
                      onClick={() => addToCart(item)}
                      title={`${item.name} - ₹${(item.priceMinor / 100).toFixed(0)}${item.isStocked === false ? " (OUT OF STOCK / 86'D)" : ""}`}
                    >
                      {/* Left Green / Red Veg indicator stripe */}
                      <span className={`veg-indicator-stripe ${item.isVeg ? "stripe-veg" : "stripe-nonveg"}`} />

                      <div className="tile-content-wrap">
                        <span className="tile-dish-name">{item.name}</span>
                        {item.isStocked === false ? (
                          <span className="tile-86-badge">86'D</span>
                        ) : qtyInCart > 0 ? (
                          <span className="tile-qty-badge">{qtyInCart}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ============================================================ */}
        {/* COLUMN 3: RIGHT ORDER CART & SETTLEMENT PANE                 */}
        {/* ============================================================ */}
        <section className="petpooja-order-ticket-panel">
          
          {/* Order Channel Tabs: Dine In / Delivery / Pick Up */}
          <div className="order-type-channel-tabs">
            <button
              type="button"
              data-testid="order-type-tab-dine_in"
              aria-selected={orderMode === "DINE_IN"}
              className={`channel-tab ${orderMode === "DINE_IN" ? "tab-active" : ""}`}
              onClick={() => {
                setOrderMode("DINE_IN");
                setShowCustomerFields(false);
              }}
            >
              <span className="tab-icon">🪑</span>
              <span className="tab-text">Dine In</span>
            </button>
            <button
              type="button"
              data-testid="order-type-tab-delivery"
              aria-selected={orderMode === "DELIVERY"}
              className={`channel-tab ${orderMode === "DELIVERY" ? "tab-active delivery-active" : ""}`}
              onClick={() => {
                setOrderMode("DELIVERY");
                setShowCustomerFields(true);
              }}
            >
              <span className="tab-icon">🛵</span>
              <span className="tab-text">Delivery</span>
            </button>
            <button
              type="button"
              data-testid="order-type-tab-pickup"
              aria-selected={orderMode === "PICKUP"}
              className={`channel-tab ${orderMode === "PICKUP" ? "tab-active pickup-active" : ""}`}
              onClick={() => {
                setOrderMode("PICKUP");
                setShowCustomerFields(true);
              }}
            >
              <span className="tab-icon">🛍️</span>
              <span className="tab-text">Pick Up</span>
            </button>
          </div>

          {/* Metadata Icon Bar */}
          <div className="table-meta-action-bar">
            {orderMode === "DINE_IN" ? (
              <div className="table-badge-cluster">
                <span className="table-t-icon">T</span>
                <span className="table-id-text">{tableNumber}</span>
              </div>
            ) : (
              <div className="order-mode-lead-icon" />
            )}

            {/* Quick Action Icons: Customer, Notes (Opens Order Wise Comments Modal), Add Customer */}
            <div className="meta-icons-cluster">
              <button
                type="button"
                className={`meta-action-icon-btn ${activeMetaTab === "CUSTOMER" ? "is-tab-active" : ""}`}
                onClick={() => {
                  setActiveMetaTab(activeMetaTab === "CUSTOMER" ? null : "CUSTOMER");
                  setShowCustomerFields(!showCustomerFields);
                }}
                title="Customer Profile"
              >
                👤
              </button>

              <button
                type="button"
                className={`meta-action-icon-btn ${showOrderCommentsModal || orderWiseComment ? "is-tab-active" : ""}`}
                onClick={() => {
                  setTempComment(orderWiseComment);
                  setShowOrderCommentsModal(true);
                }}
                title={orderWiseComment ? `Order Comment: "${orderWiseComment}"` : "Order Wise Comments / Instructions"}
              >
                💬
              </button>

              <button
                type="button"
                className={`meta-action-icon-btn ${activeMetaTab === "ADD" ? "is-tab-active" : ""}`}
                onClick={() => {
                  clearCustomerDetails();
                  setActiveMetaTab("CUSTOMER");
                  setShowCustomerFields(true);
                }}
                title="Add New Customer"
              >
                👤+
              </button>
            </div>

            {/* Section / Mode Badge in Gold Box */}
            <div className="section-tag-gold-box">
              <span>{orderMode === "DINE_IN" ? tableSection : orderMode === "DELIVERY" ? "Delivery" : "Pick Up"}</span>
            </div>
          </div>

          {/* Inline Customer Details & Tools Panel */}
          {showCustomerFields && (
            <div className="inline-customer-details-panel" data-testid="customer-fields">
              <div className="customer-inputs-col">
                <div className="customer-field-row">
                  <label htmlFor="customer-mobile" className="customer-field-label">
                    Mobile: <span className="req-asterisk">*</span>
                  </label>
                  <div className="input-wrap">
                    <input
                      id="customer-mobile"
                      aria-label="Mobile"
                      type="tel"
                      maxLength={10}
                      placeholder="Mobile No. (10 digits)"
                      value={customerMobile}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setCustomerMobile(val);
                        if (customerFormErrors.mobile) {
                          setCustomerFormErrors((prev) => ({ ...prev, mobile: undefined }));
                        }
                      }}
                      className={`customer-field-input ${customerFormErrors.mobile ? "field-input-error" : ""}`}
                    />
                    {customerFormErrors.mobile && (
                      <span className="field-error-msg">{customerFormErrors.mobile}</span>
                    )}
                  </div>
                </div>

                <div className="customer-field-row">
                  <label htmlFor="customer-name" className="customer-field-label">
                    Name: <span className="req-asterisk">*</span>
                  </label>
                  <div className="input-wrap">
                    <input
                      id="customer-name"
                      aria-label="Name"
                      type="text"
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (customerFormErrors.name) {
                          setCustomerFormErrors((prev) => ({ ...prev, name: undefined }));
                        }
                      }}
                      className={`customer-field-input ${customerFormErrors.name ? "field-input-error" : ""}`}
                    />
                    {customerFormErrors.name && (
                      <span className="field-error-msg">{customerFormErrors.name}</span>
                    )}
                  </div>
                </div>

                <div className="customer-field-row">
                  <label htmlFor="customer-address" className="customer-field-label">
                    Add: {orderMode === "DELIVERY" && <span className="req-asterisk">*</span>}
                  </label>
                  <div className="input-wrap">
                    <input
                      id="customer-address"
                      aria-label="Address"
                      type="text"
                      placeholder={orderMode === "DELIVERY" ? "Delivery Address" : "Address (Optional)"}
                      value={customerAddress}
                      onChange={(e) => {
                        setCustomerAddress(e.target.value);
                        if (customerFormErrors.address) {
                          setCustomerFormErrors((prev) => ({ ...prev, address: undefined }));
                        }
                      }}
                      className={`customer-field-input ${customerFormErrors.address ? "field-input-error" : ""}`}
                    />
                    {customerFormErrors.address && (
                      <span className="field-error-msg">{customerFormErrors.address}</span>
                    )}
                  </div>
                </div>

                <div className="customer-field-row">
                  <label htmlFor="customer-locality" className="customer-field-label">Locality:</label>
                  <div className="input-wrap">
                    <input
                      id="customer-locality"
                      aria-label="Locality"
                      type="text"
                      placeholder="Locality / Landmark"
                      value={customerLocality}
                      onChange={(e) => setCustomerLocality(e.target.value)}
                      className="customer-field-input"
                    />
                  </div>
                </div>
              </div>

              {/* Right Vertical Tool Strip */}
              <div className="customer-tools-strip">
                <button
                  type="button"
                  className="customer-tool-btn"
                  onClick={() => alert("Duplicate / Paste previous customer details")}
                  title="Copy / Paste Details"
                >
                  🗐
                </button>
                <button
                  type="button"
                  className="customer-tool-btn"
                  onClick={() => alert("Customer Order History & Saved Profiles")}
                  title="Order History / Profiles"
                >
                  📑
                </button>
                <button
                  type="button"
                  className="customer-tool-btn"
                  onClick={() => alert("Tax Exemption / Special Customer Discount")}
                  title="Tax & Discounts"
                >
                  🏷️
                </button>
                <button
                  type="button"
                  className="customer-tool-btn"
                  onClick={() => setShowAssignModal(true)}
                  title="Assign Staff / Captain"
                >
                  ⚙️
                </button>
                <button
                  type="button"
                  className="customer-tool-btn delete-btn"
                  onClick={clearCustomerDetails}
                  title="Clear Customer Fields"
                >
                  🗑️
                </button>
              </div>
            </div>
          )}

          {/* Cart Table Headers: ITEMS | CHECK ITEMS | QTY. | PRICE */}
          <div className="cart-grid-table-header">
            <span className="col-header col-items">ITEMS</span>
            <button
              type="button"
              className="col-header col-check-items link-btn"
              onClick={toggleCheckAllItems}
              title="Toggle Select All Items"
            >
              CHECK ITEMS
            </button>
            <span className="col-header col-qty">QTY.</span>
            <span className="col-header col-price">PRICE</span>
          </div>

          {/* Cart Body: Empty State Artwork OR Items List */}
          <div className="cart-items-matrix-body">
            {cart.length === 0 ? (
              <div className="petpooja-empty-cart-state">
                {/* Clean Plate Fork Knife SVG Line Art */}
                <div className="empty-plate-artwork">
                  <svg width="68" height="68" viewBox="0 0 64 64" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {/* Fork */}
                    <path d="M12 12v14a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4V12" />
                    <line x1="16" y1="12" x2="16" y2="24" />
                    <line x1="16" y1="30" x2="16" y2="52" />
                    {/* Plate */}
                    <circle cx="32" cy="32" r="16" />
                    <circle cx="32" cy="32" r="22" strokeDasharray="3 3" />
                    {/* Knife */}
                    <path d="M48 12c0 8-3 14-6 18v22h4V12z" />
                  </svg>
                </div>

                <div className="empty-cart-primary-msg">No Item Selected</div>
                <div className="empty-cart-secondary-msg">Please Select Item from Left Menu Item</div>

                {/* Collapse / Expand chevron box */}
                <div className="empty-cart-chevron-pill">
                  <span>▲</span>
                </div>
              </div>
            ) : (
              <div className="cart-lines-list">
                {cart.map((cartLine) => (
                  <div key={cartLine.cartItemId} className="cart-item-row">
                    <div className="col-item-details">
                      <div className="item-title-row">
                        <span className={`fssai-indicator-dot ${cartLine.item.isVeg ? "dot-veg" : "dot-nonveg"}`}>●</span>
                        <span className="item-name-text">{cartLine.item.name}</span>
                      </div>
                      {cartLine.notes && <div className="item-instruction-tag">Note: {cartLine.notes}</div>}
                    </div>

                    <div className="col-item-check">
                      <input
                        type="checkbox"
                        checked={cartLine.checked}
                        onChange={() => toggleCheckItem(cartLine.cartItemId)}
                        className="item-check-input"
                      />
                    </div>

                    <div className="col-item-qty-controls">
                      <button
                        type="button"
                        className="qty-spin-btn minus"
                        onClick={() => updateCartItemQty(cartLine.cartItemId, -1)}
                      >
                        -
                      </button>
                      <span className="qty-counter-number">{cartLine.quantity}</span>
                      <button
                        type="button"
                        className="qty-spin-btn plus"
                        onClick={() => updateCartItemQty(cartLine.cartItemId, 1)}
                      >
                        +
                      </button>
                    </div>

                    <div className="col-item-price-val">
                      ₹{(cartLine.itemTotalMinor / 100).toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Bottom Settlement & Action Footer */}
          <div className="cart-settlement-footer-bar">
            {/* Top Settlement Row: Split Button, Advance Order & Total */}
            <div className="split-total-row">
              <div className="footer-left-buttons-cluster">
                <button
                  type="button"
                  className="btn-split-bill"
                  onClick={() => setIsSplitModalOpen(true)}
                >
                  Split
                </button>

                <button
                  type="button"
                  className={`btn-advance-order ${isAdvanceOrder ? "is-active-advance" : ""}`}
                  onClick={() => setShowAdvanceModal(true)}
                  title="Schedule Future / Advance Order"
                >
                  {isAdvanceOrder ? `Advance: ${advanceTime || "Set"}` : "Advance Order"}
                </button>
              </div>

              <div className="total-counter-box">
                <span className="total-text-title">Total</span>
                <span className="total-amount-number">{activeCartItems.length === 0 ? "0" : grandTotalRupees}</span>
              </div>
            </div>

            {/* Middle Row: Payment Mode Pills (Cash, Card, Due, Other, More) */}
            <div className="payment-modes-pill-bar">
              <button
                type="button"
                className={`payment-mode-pill ${paymentMethod === "CASH" ? "is-selected cash" : ""}`}
                onClick={() => {
                  setPaymentMethod("CASH");
                  setIsPaidChecked(true);
                }}
              >
                <span className="mode-icon">💵</span>
                <span className="mode-label">Cash</span>
                {paymentMethod === "CASH" && <span className="mode-check">✔</span>}
              </button>

              <button
                type="button"
                className={`payment-mode-pill ${paymentMethod === "CARD" ? "is-selected" : ""}`}
                onClick={() => {
                  setPaymentMethod("CARD");
                  setIsPaidChecked(true);
                }}
              >
                <span className="mode-icon">💳</span>
                <span className="mode-label">Card</span>
                {paymentMethod === "CARD" && <span className="mode-check">✔</span>}
              </button>

              <button
                type="button"
                className={`payment-mode-pill ${paymentMethod === "DUE" ? "is-selected" : ""}`}
                onClick={() => {
                  setPaymentMethod("DUE");
                  setIsPaidChecked(false);
                }}
              >
                <span className="mode-icon">📝</span>
                <span className="mode-label">Due</span>
                {paymentMethod === "DUE" && <span className="mode-check">✔</span>}
              </button>

              <button
                type="button"
                className={`payment-mode-pill ${paymentMethod.includes("Other") || paymentMethod.includes("Room") ? "is-selected" : ""}`}
                onClick={() => setShowMorePaymentModal(true)}
              >
                <span className="mode-icon">📦</span>
                <span className="mode-label">{paymentMethod.includes("Room") ? "Room" : "Other"}</span>
                {(paymentMethod.includes("Other") || paymentMethod.includes("Room")) && <span className="mode-check">✔</span>}
              </button>

              <button
                type="button"
                className={`payment-mode-pill ${paymentMethod === "UPI" || paymentMethod === "PART" || paymentMethod === "NOT_PAID" || showMorePaymentModal ? "is-selected" : ""}`}
                onClick={() => setShowMorePaymentModal(true)}
              >
                <span className="mode-label">
                  {paymentMethod === "UPI" ? "UPI" : paymentMethod === "PART" ? "Part" : paymentMethod === "NOT_PAID" ? "Unpaid" : "^ More"}
                </span>
                {(paymentMethod === "UPI" || paymentMethod === "PART" || paymentMethod === "NOT_PAID") && <span className="mode-check">✔</span>}
              </button>
            </div>

            {/* Bottom Row: "It's Paid" Checkbox & Red "Print & EBill" Button */}
            <div className="bottom-action-buttons-row">
              <label className="its-paid-checkbox-label">
                <input
                  type="checkbox"
                  checked={isPaidChecked}
                  onChange={(e) => setIsPaidChecked(e.target.checked)}
                  className="its-paid-input"
                />
                <span className="its-paid-text">It&apos;s Paid</span>
              </label>

              <div className="action-buttons-group">
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="btn-clear-cart"
                    onClick={clearCart}
                    title="Clear Cart"
                  >
                    Clear
                  </button>
                )}
                
                {orderMode === "DINE_IN" && (
                  <button
                    type="button"
                    className="btn-kot-fire-secondary"
                    onClick={handleFireKot}
                    disabled={processingOrder}
                    title="Send Order to Kitchen without Settling Payment"
                  >
                    KOT
                  </button>
                )}

                <button
                  type="button"
                  className="btn-print-ebill-primary"
                  onClick={handlePrintAndEBill}
                  disabled={processingOrder}
                >
                  {processingOrder ? "Processing..." : "Print & EBill"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* "Order Wise Comments" Modal (Exact Screenshot Match) */}
      {showOrderCommentsModal && (
        <div className="pos-modal-backdrop" onClick={() => setShowOrderCommentsModal(false)}>
          <div className="order-comments-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="order-comments-header">
              <h3 className="order-comments-title">Order Wise Comments</h3>
              <button
                type="button"
                className="order-comments-close"
                onClick={() => setShowOrderCommentsModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="order-comments-body">
              <label className="order-comment-label" htmlFor="order-comment-input">
                Comment:
              </label>
              <textarea
                id="order-comment-input"
                className="order-comment-textarea"
                placeholder=""
                value={tempComment}
                onChange={(e) => setTempComment(e.target.value)}
                rows={5}
                autoFocus
              />
            </div>

            <div className="order-comments-footer">
              <button
                type="button"
                className="btn-order-comment-cancel"
                onClick={() => setShowOrderCommentsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-order-comment-save"
                onClick={() => {
                  setOrderWiseComment(tempComment);
                  setShowOrderCommentsModal(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Assign to" Staff / Captain Assignment Modal */}
      {showAssignModal && (
        <div className="pos-modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="assign-to-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="assign-modal-header">
              <h3 className="assign-modal-title">Assign to</h3>
              <button
                type="button"
                className="assign-modal-close"
                onClick={() => setShowAssignModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="assign-modal-list">
              {captainsList.map((captain) => {
                const isSelected = assignedCaptain === captain;
                return (
                  <div
                    key={captain}
                    className={`assign-row-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setAssignedCaptain(captain)}
                  >
                    <span className="captain-name-text">{captain}</span>
                    <div className={`assign-radio-circle ${isSelected ? "checked" : ""}`}>
                      {isSelected && <span className="assign-radio-inner-dot" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="assign-modal-footer">
              <button
                type="button"
                className="btn-assign-cancel"
                onClick={() => setShowAssignModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-assign-done"
                onClick={() => {
                  setWaiterName(assignedCaptain);
                  setShowAssignModal(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Order Modal */}
      {showAdvanceModal && (
        <div className="pos-modal-backdrop" onClick={() => setShowAdvanceModal(false)}>
          <div className="pos-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-header">
              <h3>Schedule Advance {orderMode === "DELIVERY" ? "Delivery" : "Pick Up"}</h3>
              <button type="button" className="close-x" onClick={() => setShowAdvanceModal(false)}>✕</button>
            </div>
            <div className="pos-modal-body">
              <label className="input-field-group">
                <span>Advance Order Date</span>
                <input
                  type="date"
                  value={advanceDate || new Date().toISOString().split("T")[0]}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="form-input"
                />
              </label>
              <label className="input-field-group">
                <span>Requested Delivery / Pick Up Time</span>
                <input
                  type="time"
                  value={advanceTime || "13:30"}
                  onChange={(e) => setAdvanceTime(e.target.value)}
                  className="form-input"
                />
              </label>
            </div>
            <div className="pos-modal-footer">
              {isAdvanceOrder && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginRight: "auto", color: "#dc2626" }}
                  onClick={() => {
                    setIsAdvanceOrder(false);
                    setShowAdvanceModal(false);
                  }}
                >
                  Cancel Advance
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setShowAdvanceModal(false)}>Close</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setIsAdvanceOrder(true);
                  setShowAdvanceModal(false);
                }}
              >
                Set Advance Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Split Modal */}
      {isSplitModalOpen && (
        <BillSplitModal
          cart={cart}
          totalMinor={grandTotalMinor}
          onClose={() => setIsSplitModalOpen(false)}
          onConfirmSplit={(details) => {
            alert(`Bill Split configured: ${details.numGuests} guests (₹${(details.perGuestMinor / 100).toFixed(2)} each).`);
            setIsSplitModalOpen(false);
          }}
        />
      )}

      {/* "More" Payment Options Modal (Exact Screenshot Match) */}
      <MorePaymentModal
        isOpen={showMorePaymentModal}
        onClose={() => setShowMorePaymentModal(false)}
        currentMethod={paymentMethod}
        isPaid={isPaidChecked}
        totalMinor={grandTotalMinor}
        customPaymentTypes={customPaymentTypes}
        onOpenSplitModal={() => {
          setShowMorePaymentModal(false);
          setIsSplitModalOpen(true);
        }}
        onSelectMethod={(method, extraData) => {
          setPaymentMethod(method);
          if (extraData?.isPaid !== undefined) {
            setIsPaidChecked(extraData.isPaid);
          }
          if (extraData?.roomNumber) {
            setRoomServiceDetails({
              roomNumber: extraData.roomNumber,
              guestName: extraData.guestName,
            });
          }
        }}
      />

      {/* ============================================================ */}
      {/* EXACT PETPOOJA POS STYLING & RESPONSIVE LAYOUT               */}
      {/* ============================================================ */}
      <style jsx>{`
        .petpooja-billing-screen-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 42px);
          width: 100vw;
          background: #f8fafc;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          user-select: none;
        }

        .petpooja-pos-layout-grid {
          display: grid;
          grid-template-columns: 168px 1fr 430px;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }

        /* ------------------------------------------------------------ */
        /* COLUMN 1: CATEGORY RAIL                                      */
        /* ------------------------------------------------------------ */
        .petpooja-category-rail {
          background: #ffffff;
          border-right: 1.5px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .category-rail-scroll {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .category-nav-tile {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 11px 12px;
          background: #ffffff;
          border: none;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #334155;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.12s, color 0.12s;
        }
        .category-nav-tile:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .category-nav-tile.is-active {
          background: #ffe8e8;
          color: #dc2626;
          font-weight: 700;
          border-left: 4px solid #dc2626;
        }
        .category-tile-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ------------------------------------------------------------ */
        /* COLUMN 2: MENU ITEMS MATRIX & SEARCH                         */
        /* ------------------------------------------------------------ */
        .petpooja-menu-matrix-panel {
          background: #ffffff;
          border-right: 1.5px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .item-search-bar-row {
          padding: 8px 12px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .item-search-input-box {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 10px;
          gap: 6px;
        }
        .search-icon {
          font-size: 0.875rem;
          color: #64748b;
        }
        .matrix-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          color: #0f172a;
          background: transparent;
        }
        .matrix-search-input::placeholder {
          color: #94a3b8;
        }
        .clear-search-x {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.75rem;
        }

        .item-tiles-matrix-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          background: #fdfdfd;
        }
        .no-search-results {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: #94a3b8;
        }
        .empty-search-icon {
          font-size: 2rem;
          margin-bottom: 8px;
        }
        .empty-search-text {
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* 4-Column Grid for Menu Tiles */
        .petpooja-items-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .petpooja-item-tile {
          position: relative;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          min-height: 72px;
          padding: 8px 10px 8px 12px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-align: left;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
          transition: transform 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease;
          overflow: hidden;
        }
        .petpooja-item-tile:hover {
          border-color: #94a3b8;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
        }
        .petpooja-item-tile:active {
          transform: scale(0.98);
        }
        .petpooja-item-tile.in-cart {
          border-color: #22c55e;
          background: #f0fdf4;
        }
        .petpooja-item-tile.is-out-of-stock {
          opacity: 0.55;
          background: #f8fafc;
          border-color: #fca5a5;
          border-style: dashed;
          cursor: not-allowed;
        }
        .petpooja-item-tile.is-out-of-stock:hover {
          border-color: #ef4444;
          background: #fef2f2;
        }
        .tile-86-badge {
          background: #dc2626;
          color: #ffffff;
          font-size: 0.625rem;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.5px;
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.3);
        }

        /* Green / Red Left Indicator Stripe */
        .veg-indicator-stripe {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
        }
        .veg-indicator-stripe.stripe-veg {
          background-color: #16a34a;
        }
        .veg-indicator-stripe.stripe-nonveg {
          background-color: #dc2626;
        }

        .tile-content-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .tile-dish-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #1e293b;
          line-height: 1.25;
          word-break: break-word;
        }
        .tile-qty-badge {
          background: #16a34a;
          color: #ffffff;
          font-size: 0.6875rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 999px;
        }

        /* ------------------------------------------------------------ */
        /* COLUMN 3: ORDER TICKET & SETTLEMENT PANE                     */
        /* ------------------------------------------------------------ */
        .petpooja-order-ticket-panel {
          background: #ffffff;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        /* Channel Tabs (Dine In / Delivery / Pick Up) */
        .order-type-channel-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .channel-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 4px;
          background: transparent;
          border: 1px solid transparent;
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-bottom: 2.5px solid transparent;
          transition: all 0.12s;
        }
        .channel-tab.tab-active {
          color: #dc2626;
          border-bottom-color: #dc2626;
          background: #fef2f2;
        }
        .channel-tab.delivery-active, .channel-tab.pickup-active {
          background: #ffebee;
          color: #dc2626;
          border: 1px solid #f87171;
          border-bottom: 2.5px solid #dc2626;
          font-weight: 700;
        }
        .tab-icon {
          font-size: 0.9375rem;
        }

        /* Table & Customer Info Row */
        .table-meta-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          min-height: 42px;
        }
        .table-badge-cluster {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .table-t-icon {
          font-size: 0.875rem;
          font-weight: 800;
          color: #7f1d1d;
        }
        .table-id-text {
          font-size: 1rem;
          font-weight: 900;
          color: #dc2626;
        }
        .order-mode-lead-icon {
          width: 8px;
        }

        .meta-icons-cluster {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .meta-action-icon-btn {
          background: transparent;
          border: 1.5px solid transparent;
          font-size: 1.05rem;
          color: #475569;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.1s;
        }
        .meta-action-icon-btn:hover {
          background: #f1f5f9;
        }
        .meta-action-icon-btn.is-tab-active {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 4px;
        }

        .section-tag-gold-box {
          background: #f59e0b;
          color: #000000;
          font-size: 0.75rem;
          font-weight: 900;
          padding: 4px 12px;
          border-radius: 2px;
          letter-spacing: 0.5px;
        }

        /* Inline Customer Details & Tools Strip */
        .inline-customer-details-panel {
          display: grid;
          grid-template-columns: 1fr 40px;
          background: #ffffff;
          border-bottom: 1.5px solid #cbd5e1;
          padding: 8px 12px;
          gap: 8px;
        }
        .customer-inputs-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .customer-field-row {
          display: grid;
          grid-template-columns: 62px 1fr;
          align-items: center;
          gap: 6px;
        }
        .customer-field-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          text-align: left;
        }
        .req-asterisk {
          color: #ef4444;
          font-weight: 700;
        }
        .input-wrap {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .customer-field-input {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 4px 8px;
          font-size: 0.8125rem;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          transition: border-color 0.12s, background-color 0.12s;
          width: 100%;
        }
        .customer-field-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
        .customer-field-input.field-input-error {
          border-color: #ef4444 !important;
          background-color: #fef2f2 !important;
        }
        .customer-field-input.field-input-error:focus {
          box-shadow: 0 0 0 1px #ef4444 !important;
        }
        .field-error-msg {
          color: #dc2626;
          font-size: 0.6875rem;
          font-weight: 600;
          margin-top: 2px;
          line-height: 1.1;
        }
        .customer-field-input::placeholder {
          color: #94a3b8;
        }

        .customer-tools-strip {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          border-left: 1px solid #e2e8f0;
          padding-left: 6px;
          gap: 4px;
        }
        .customer-tool-btn {
          width: 28px;
          height: 24px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          font-size: 0.75rem;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.1s;
        }
        .customer-tool-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .customer-tool-btn.delete-btn:hover {
          background: #fee2e2;
          border-color: #ef4444;
          color: #dc2626;
        }

        /* Cart Grid Table Header */
        .cart-grid-table-header {
          display: grid;
          grid-template-columns: 1.4fr 90px 65px 65px;
          padding: 7px 12px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.6875rem;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .col-items {
          text-align: left;
        }
        .col-check-items {
          text-align: center;
        }
        .col-check-items.link-btn {
          background: transparent;
          border: none;
          color: #3b82f6;
          text-decoration: underline;
          cursor: pointer;
          font-size: 0.6875rem;
          font-weight: 800;
          padding: 0;
        }
        .col-qty {
          text-align: center;
        }
        .col-price {
          text-align: right;
        }

        /* Cart Items Scroll Area */
        .cart-items-matrix-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        /* Empty Cart State matching Screenshot */
        .petpooja-empty-cart-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          position: relative;
        }
        .empty-plate-artwork {
          margin-bottom: 14px;
          opacity: 0.7;
        }
        .empty-cart-primary-msg {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #475569;
          margin-bottom: 4px;
        }
        .empty-cart-secondary-msg {
          font-size: 0.75rem;
          color: #94a3b8;
        }
        .empty-cart-chevron-pill {
          position: absolute;
          bottom: 10px;
          width: 32px;
          height: 18px;
          background: #e2e8f0;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          color: #64748b;
          cursor: pointer;
        }

        /* Filled Cart Rows */
        .cart-lines-list {
          display: flex;
          flex-direction: column;
        }
        .cart-item-row {
          display: grid;
          grid-template-columns: 1.4fr 90px 65px 65px;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.8125rem;
        }
        .cart-item-row:hover {
          background: #f8fafc;
        }
        .col-item-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .item-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fssai-indicator-dot {
          font-size: 0.6875rem;
        }
        .fssai-indicator-dot.dot-veg {
          color: #16a34a;
        }
        .fssai-indicator-dot.dot-nonveg {
          color: #dc2626;
        }
        .item-name-text {
          font-weight: 600;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .item-instruction-tag {
          font-size: 0.6875rem;
          color: #d97706;
          font-style: italic;
        }

        .col-item-check {
          text-align: center;
        }
        .item-check-input {
          cursor: pointer;
        }

        .col-item-qty-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .qty-spin-btn {
          width: 20px;
          height: 20px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 2px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qty-spin-btn:hover {
          background: #e2e8f0;
        }
        .qty-counter-number {
          font-weight: 700;
          min-width: 14px;
          text-align: center;
          font-size: 0.8125rem;
        }
        .col-item-price-val {
          text-align: right;
          font-weight: 700;
          color: #0f172a;
          font-size: 0.8125rem;
        }

        /* ------------------------------------------------------------ */
        /* SETTLEMENT & FOOTER ACTION BAR                               */
        /* ------------------------------------------------------------ */
        .cart-settlement-footer-bar {
          border-top: 1px solid #cbd5e1;
          background: #ffffff;
          padding: 8px 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Split, Advance Order & Total Row */
        .split-total-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-left-buttons-cluster {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-split-bill {
          background: #e2e8f0;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }
        .btn-split-bill:hover {
          background: #cbd5e1;
        }
        .btn-advance-order {
          background: #dbeafe;
          border: 1px solid #bfdbfe;
          border-radius: 4px;
          padding: 4px 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #1e40af;
          cursor: pointer;
        }
        .btn-advance-order:hover {
          background: #bfdbfe;
        }
        .btn-advance-order.is-active-advance {
          background: #2563eb;
          color: #ffffff;
          border-color: #1d4ed8;
          font-weight: 700;
        }

        .total-counter-box {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .total-text-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #0f172a;
        }
        .total-amount-number {
          font-size: 1.375rem;
          font-weight: 900;
          color: #000000;
        }

        /* Payment Mode Pills */
        .payment-modes-pill-bar {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }
        .payment-mode-pill {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 6px 2px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.1s;
        }
        .payment-mode-pill:hover {
          border-color: #94a3b8;
        }
        .payment-mode-pill.is-selected {
          border-color: #16a34a;
          color: #16a34a;
          background: #f0fdf4;
          font-weight: 700;
        }
        .payment-mode-pill.is-selected.cash {
          border-color: #16a34a;
        }
        .mode-icon {
          font-size: 0.75rem;
        }
        .mode-label {
          font-size: 0.75rem;
        }
        .mode-check {
          color: #16a34a;
          font-size: 0.6875rem;
        }

        /* Bottom Action Buttons Row */
        .bottom-action-buttons-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 4px;
        }
        .its-paid-checkbox-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #1e293b;
          cursor: pointer;
        }
        .its-paid-input {
          width: 14px;
          height: 14px;
          cursor: pointer;
        }

        .action-buttons-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-clear-cart {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #64748b;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-clear-cart:hover {
          background: #fee2e2;
          color: #dc2626;
        }

        .back-to-tables-tile {
          background: #0f172a !important;
          color: #f8fafc !important;
          font-weight: 800;
          border-left: 3px solid #38bdf8;
        }
        .back-to-tables-tile:hover {
          background: #1e293b !important;
          color: #38bdf8 !important;
        }

        .btn-kot-fire-secondary {
          background: #f59e0b;
          color: #000000;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 0.875rem;
          font-weight: 800;
          cursor: pointer;
          transition: background-color 0.12s;
        }
        .btn-kot-fire-secondary:hover {
          background: #d97706;
          color: #ffffff;
        }
        .btn-kot-fire-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-print-ebill-primary {
          background: #dc2626;
          color: #ffffff;
          border: none;
          border-radius: 4px;
          padding: 8px 20px;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
          transition: background-color 0.12s;
        }
        .btn-print-ebill-primary:hover {
          background: #b91c1c;
        }
        .btn-print-ebill-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ------------------------------------------------------------ */
        /* "ORDER WISE COMMENTS" MODAL (Exact Screenshot Match)         */
        /* ------------------------------------------------------------ */
        .order-comments-modal-card {
          background: #ffffff;
          border-radius: 8px;
          width: 520px;
          max-width: 92vw;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modalFadeIn 0.15s ease-out;
        }
        .order-comments-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .order-comments-title {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
        }
        .order-comments-close {
          background: transparent;
          border: none;
          font-size: 1.25rem;
          color: #64748b;
          cursor: pointer;
          padding: 2px 6px;
        }
        .order-comments-close:hover {
          color: #0f172a;
        }
        .order-comments-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .order-comment-label {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #334155;
        }
        .order-comment-textarea {
          width: 100%;
          min-height: 120px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 10px 12px;
          font-size: 0.9375rem;
          color: #0f172a;
          outline: none;
          font-family: inherit;
          resize: vertical;
          box-sizing: border-box;
          transition: border-color 0.12s, box-shadow 0.12s;
        }
        .order-comment-textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .order-comments-footer {
          padding: 14px 20px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          background: #ffffff;
        }
        .btn-order-comment-cancel {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 8px 22px;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }
        .btn-order-comment-cancel:hover {
          background: #f1f5f9;
        }
        .btn-order-comment-save {
          background: #dc2626;
          color: #ffffff;
          border: none;
          padding: 8px 26px;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(220, 38, 38, 0.3);
        }
        .btn-order-comment-save:hover {
          background: #b91c1c;
        }

        /* ------------------------------------------------------------ */
        /* "ASSIGN TO" STAFF / CAPTAIN MODAL                            */
        /* ------------------------------------------------------------ */
        .pos-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .assign-to-modal-card {
          background: #ffffff;
          border-radius: 8px;
          width: 480px;
          max-width: 92vw;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modalFadeIn 0.15s ease-out;
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .assign-modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .assign-modal-title {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
        }
        .assign-modal-close {
          background: transparent;
          border: none;
          font-size: 1.25rem;
          color: #64748b;
          cursor: pointer;
          padding: 2px 6px;
        }
        .assign-modal-close:hover {
          color: #0f172a;
        }

        .assign-modal-list {
          display: flex;
          flex-direction: column;
          max-height: 380px;
          overflow-y: auto;
        }
        .assign-row-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          transition: background-color 0.1s;
        }
        .assign-row-item:hover {
          background: #f8fafc;
        }
        .assign-row-item.selected {
          background: #fef2f2;
        }
        .captain-name-text {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #1e293b;
        }
        .assign-radio-circle {
          width: 20px;
          height: 20px;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s;
        }
        .assign-radio-circle.checked {
          border-color: #dc2626;
        }
        .assign-radio-inner-dot {
          width: 10px;
          height: 10px;
          background: #dc2626;
          border-radius: 50%;
        }

        .assign-modal-footer {
          padding: 14px 20px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          background: #ffffff;
        }
        .btn-assign-cancel {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 8px 22px;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }
        .btn-assign-cancel:hover {
          background: #f1f5f9;
        }
        .btn-assign-done {
          background: #dc2626;
          color: #ffffff;
          border: none;
          padding: 8px 26px;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(220, 38, 38, 0.3);
        }
        .btn-assign-done:hover {
          background: #b91c1c;
        }

        /* Advance Order Modal Styling */
        .pos-modal-card {
          background: #ffffff;
          border-radius: 8px;
          width: 440px;
          max-width: 90vw;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .pos-modal-header {
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .pos-modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }
        .close-x {
          background: transparent;
          border: none;
          font-size: 1.125rem;
          color: #94a3b8;
          cursor: pointer;
        }
        .pos-modal-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .input-field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #475569;
        }
        .form-input, .form-textarea {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 0.875rem;
          outline: none;
          font-family: inherit;
        }
        .form-input:focus, .form-textarea:focus {
          border-color: #3b82f6;
        }
        .pos-modal-footer {
          padding: 12px 18px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .btn-secondary {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 7px 14px;
          border-radius: 4px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-primary {
          background: #dc2626;
          color: #ffffff;
          border: none;
          padding: 7px 16px;
          border-radius: 4px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
