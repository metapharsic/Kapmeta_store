import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TableViewFloor from "../components/TableViewFloor";

describe("TableViewFloor Component", () => {
  it("renders the top toolbar with Table View title, refresh, Add Table, Delivery, and Pick Up buttons", () => {
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

  it("renders the Move KOT / Items toggle and all 5 status legend indicators", () => {
    render(<TableViewFloor />);

    expect(screen.getByText("Move KOT / Items")).toBeInTheDocument();
    expect(screen.getByText("Blank Table")).toBeInTheDocument();
    expect(screen.getByText("Running Table")).toBeInTheDocument();
    expect(screen.getByText("Printed Table")).toBeInTheDocument();
    expect(screen.getByText("Paid Table")).toBeInTheDocument();
    expect(screen.getByText("Running KOT Table")).toBeInTheDocument();
  });

  it("renders the AC section with A1 to A15 including printed table A8 with ₹238.00 and 26 Min", () => {
    render(<TableViewFloor />);

    expect(screen.getByText("AC")).toBeInTheDocument();

    // Table labels
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
    expect(screen.getByText("A8")).toBeInTheDocument();
    expect(screen.getByText("A15")).toBeInTheDocument();

    // A8 Printed status values
    expect(screen.getByText("26 Min")).toBeInTheDocument();
    expect(screen.getByText("₹238.00")).toBeInTheDocument();
  });

  it("renders the Non AC section with B1 to B26 including occupied running KOT tables", () => {
    render(<TableViewFloor />);

    expect(screen.getByText("Non AC")).toBeInTheDocument();

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

  it("triggers onSelectTable when a table card is clicked", () => {
    const handleSelect = vi.fn();
    render(<TableViewFloor onSelectTable={handleSelect} />);

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
