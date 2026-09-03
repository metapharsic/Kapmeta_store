import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TableViewFloor from "../components/TableViewFloor";

// Mock data generator for AC (A1-A15) and Non AC (B1-B26)
const generateMockTables = () => {
  const tables = [];
  // AC: A1..A15
  for (let i = 1; i <= 15; i++) {
    const num = `A${i}`;
    let status = "VACANT";
    let currentOrder = null;
    if (num === "A8") {
      status = "PRINTED";
      currentOrder = {
        id: "ord_a8",
        createdAt: new Date(Date.now() - 26 * 60000).toISOString(),
        grandTotalPaise: 23800,
        items: [{ id: "item1" }],
        kots: [],
      };
    }
    tables.push({
      id: `tbl_${num}`,
      tableNumber: num,
      capacity: 4,
      section: "AC",
      status,
      currentOrder,
      activeOrderId: currentOrder ? currentOrder.id : null,
    });
  }

  // Non AC: B1..B26
  for (let i = 1; i <= 26; i++) {
    const num = `B${i}`;
    let status = "VACANT";
    let currentOrder = null;
    if (num === "B4") {
      status = "RUNNING_KOT";
      currentOrder = {
        id: "ord_b4",
        createdAt: new Date(Date.now() - 31 * 60000).toISOString(),
        grandTotalPaise: 74381,
        items: [{ id: "b4_item" }],
        kots: [{ id: "kot1", status: "QUEUED" }],
      };
    } else if (num === "B7") {
      status = "RUNNING_KOT";
      currentOrder = {
        id: "ord_b7",
        createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
        grandTotalPaise: 4286,
        items: [{ id: "b7_item" }],
        kots: [{ id: "kot2", status: "QUEUED" }],
      };
    } else if (num === "B11") {
      status = "RUNNING_KOT";
      currentOrder = {
        id: "ord_b11",
        createdAt: new Date(Date.now() - 11 * 60000).toISOString(),
        grandTotalPaise: 19810,
        items: [{ id: "b11_item" }],
        kots: [{ id: "kot3", status: "QUEUED" }],
      };
    }
    tables.push({
      id: `tbl_${num}`,
      tableNumber: num,
      capacity: 4,
      section: "Non AC",
      status,
      currentOrder,
      activeOrderId: currentOrder ? currentOrder.id : null,
    });
  }

  return tables;
};

vi.mock("../lib/auth", () => ({
  authedFetch: vi.fn().mockImplementation((url: string) => {
    if (url === "/tables") {
      return Promise.resolve({
        ok: true,
        json: async () => generateMockTables(),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  }),
  getSession: vi.fn().mockReturnValue({
    accessToken: "mock-token",
    userId: "user_1",
    email: "test@kapmeta.com",
    outletId: "outlet_1",
  }),
  getWsBase: vi.fn().mockReturnValue("ws://localhost:4001/ws"),
}));

describe("TableViewFloor Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the top toolbar with Table View title, refresh, Add Table, Delivery, and Pick Up buttons", async () => {
    const handleDelivery = vi.fn();
    const handlePickup = vi.fn();

    render(
      <TableViewFloor
        onNavigateDelivery={handleDelivery}
        onNavigatePickup={handlePickup}
      />
    );

    expect(screen.getByText("Table View")).toBeInTheDocument();
    expect(screen.getByTitle("Refresh Tables Status")).toBeInTheDocument();

    const addTableBtn = screen.getByText("Add Table");
    expect(addTableBtn).toBeInTheDocument();

    const deliveryBtn = screen.getByText("Delivery");
    expect(deliveryBtn).toBeInTheDocument();
    fireEvent.click(deliveryBtn);
    expect(handleDelivery).toHaveBeenCalledTimes(1);

    const pickupBtn = screen.getByText("Pick Up");
    expect(pickupBtn).toBeInTheDocument();
    fireEvent.click(pickupBtn);
    expect(handlePickup).toHaveBeenCalledTimes(1);
  });

  it("renders the Move KOT / Items toggle and all status legend indicators", async () => {
    render(<TableViewFloor />);

    expect(screen.getByText("Move KOT / Items")).toBeInTheDocument();
    expect(screen.getByText("Blank Table")).toBeInTheDocument();
    expect(screen.getByText("Running Table")).toBeInTheDocument();
    expect(screen.getByText("Printed Table")).toBeInTheDocument();
    expect(screen.getByText("Paid Table")).toBeInTheDocument();
    expect(screen.getByText("Running KOT Table")).toBeInTheDocument();
  });

  it("renders the AC section with A1 to A15 including printed table A8 with ₹238.00 and 26 Min", async () => {
    render(<TableViewFloor />);

    await waitFor(() => {
      expect(screen.getByText("AC")).toBeInTheDocument();
    });

    // Table labels
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
    expect(screen.getByText("A8")).toBeInTheDocument();
    expect(screen.getByText("A15")).toBeInTheDocument();

    // A8 Printed status values
    expect(screen.getByText("26 Min")).toBeInTheDocument();
    expect(screen.getByText("₹238.00")).toBeInTheDocument();
  });

  it("renders the Non AC section with B1 to B26 including occupied running KOT tables", async () => {
    render(<TableViewFloor />);

    await waitFor(() => {
      expect(screen.getByText("Non AC")).toBeInTheDocument();
    });

    // Table labels
    expect(screen.getByText("B1")).toBeInTheDocument();
    expect(screen.getByText("B4")).toBeInTheDocument();
    expect(screen.getByText("B7")).toBeInTheDocument();
    expect(screen.getByText("B11")).toBeInTheDocument();
    expect(screen.getByText("B15")).toBeInTheDocument();
    expect(screen.getByText("B18")).toBeInTheDocument();
    expect(screen.getByText("B19")).toBeInTheDocument();
    expect(screen.getByText("B21")).toBeInTheDocument();
    expect(screen.getByText("B22")).toBeInTheDocument();
    expect(screen.getByText("B23")).toBeInTheDocument();
    expect(screen.getByText("B26")).toBeInTheDocument();

    // B4 values: 31 Min, ₹743.81
    expect(screen.getByText("31 Min")).toBeInTheDocument();
    expect(screen.getByText("₹743.81")).toBeInTheDocument();

    // B7 values: 3 Min, ₹42.86
    expect(screen.getByText("3 Min")).toBeInTheDocument();
    expect(screen.getByText("₹42.86")).toBeInTheDocument();

    // B11 values: 11 Min, ₹198.10
    expect(screen.getByText("11 Min")).toBeInTheDocument();
    expect(screen.getByText("₹198.10")).toBeInTheDocument();
  });

  it("triggers onSelectTable when a table card is clicked", async () => {
    const handleSelect = vi.fn();
    render(<TableViewFloor onSelectTable={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText("A1")).toBeInTheDocument();
    });

    const tableA1 = screen.getByText("A1");
    fireEvent.click(tableA1);

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ tableNumber: "A1" })
    );
  });

  it("opens Add Table modal when Add Table button is clicked", () => {
    render(<TableViewFloor />);

    const addTableBtn = screen.getByText("Add Table");
    fireEvent.click(addTableBtn);

    expect(screen.getByText("Add New Dining Table")).toBeInTheDocument();
    expect(screen.getByText("Table Number / Code")).toBeInTheDocument();
  });
});
