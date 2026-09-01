# Task 2: Live Table Occupancy Rate Metric — Completion Report

**Project:** KapMeta POS (Kapmeta) &bull; **Domain:** Admin & Floor Operations &bull; **Date:** 2026-08-25 &bull; **Status:** Completed & Verified

---

## 1. Executive Summary & Objective

In a busy dining restaurant, table occupancy rate is a vital operational KPI representing how effectively the dining floor and seating capacity are utilized in real-time.

Prior to Task 2, the **TABLE OCCUPANCY RATE** card on the Admin Dashboard (`/admin`) was rendered with a muted style displaying *"Not available"*.

Task 2 delivered:
1. A live mathematical occupancy and capacity computation endpoint (`GET /tables/occupancy`) in `apps/api/src/routes/tables.ts`.
2. Real-time aggregation of active dining tables (`isActive: true`), active dine-in orders (`DRAFT`, `PLACED`, `CONFIRMED`, `KOT_CREATED`, `IN_PREPARATION`, `READY`, `SERVED`), and section-wise breakdown (`Indoor AC`, `Terrace`, `Family Section`).
3. Integration on `/admin` dashboard replacing the muted placeholder with a live, animated KPI card showing the exact percentage and occupied table counts.

---

## 2. Mathematical Definition

$$\text{Table Occupancy Rate (\%)} = \left(\frac{\text{Occupied Tables with Active Orders}}{\text{Total Active Configured Tables}}\right) \times 100$$

$$\text{Seating Capacity Utilization (\%)} = \left(\frac{\text{Seated Guests on Occupied Tables}}{\text{Total Restaurant Seat Capacity}}\right) \times 100$$

---

## 3. Files Created / Modified

| File | Changes Made |
| :--- | :--- |
| [`apps/api/src/routes/tables.ts`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/apps/api/src/routes/tables.ts) | Implemented `GET /tables/occupancy` endpoint computing live occupancy, vacant tables, capacity utilization, and section aggregations. |
| [`apps/pos-web/pages/admin.tsx`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/apps/pos-web/pages/admin.tsx) | Added `TableOccupancyApi` types, `tableOccupancy` state, integrated `/tables/occupancy` in dashboard load effect, and rendered the active KPI card. |
| [`CHECKPOINT.md`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/CHECKPOINT.md) | Recorded completion of Task 2. |

---

## 4. Verification Evidence

### A. Endpoint Verification (`GET /tables/occupancy`)
```powershell
$occupancy = Invoke-RestMethod -Uri "http://localhost:4001/tables/occupancy" -Method GET -Headers @{ Authorization = "Bearer <token>" }
```
**Response (HTTP 200 OK):**
```json
{
  "outletId": "a0deb015-8ef8-4ef5-aac7-6e91c9da6b5b",
  "totalTables": 6,
  "occupiedTables": 0,
  "vacantTables": 6,
  "occupancyRatePercent": 0,
  "totalCapacity": 28,
  "occupiedCapacity": 0,
  "capacityUtilizationPercent": 0,
  "sections": [
    {
      "section": "Indoor AC",
      "totalTables": 3,
      "occupiedTables": 0,
      "vacantTables": 3,
      "totalCapacity": 14,
      "occupiedCapacity": 0,
      "occupancyRatePercent": 0
    },
    {
      "section": "Terrace",
      "totalTables": 2,
      "occupiedTables": 0,
      "vacantTables": 2,
      "totalCapacity": 6,
      "occupiedCapacity": 0,
      "occupancyRatePercent": 0
    },
    {
      "section": "Family Section",
      "totalTables": 1,
      "occupiedTables": 0,
      "vacantTables": 1,
      "totalCapacity": 8,
      "occupiedCapacity": 0,
      "occupancyRatePercent": 0
    }
  ]
}
```

### B. UI Rendering Confirmation
- **Card State:** Active (`<div className="kpi-card">`), icon badge blue.
- **Heading:** `TABLE OCCUPANCY RATE`.
- **Main Metric:** `0.0%` (or live active occupancy rate).
- **Sub-badge:** `0 of 6 tables occupied` with green live indicator dot.
