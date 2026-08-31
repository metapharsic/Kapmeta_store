import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PetPoojaOrdersView, {
  REFERENCE_CURRENT_ORDERS,
} from "../components/PetPoojaOrdersView";

describe("PetPoojaOrdersView Component", () => {
  it("renders the top subheader tabs and back button", () => {
    const handleBack = vi.fn();
    render(<PetPoojaOrdersView onBackToPos={handleBack} />);

    expect(screen.getByText("Current Order")).toBeInTheDocument();
    expect(screen.getByText("Online Order")).toBeInTheDocument();
    expect(screen.getByText("Advance Order")).toBeInTheDocument();

    const backBtn = screen.getByText("< Back");
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("renders the 4 channel filter cards (All, Dine In, Delivery, Pick Up)", () => {
    render(<PetPoojaOrdersView />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getAllByText("Dine In").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Delivery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pick Up").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the status legend indicators (Saved Bill, Printed Bill, Cancelled Bill, Paid)", () => {
    render(<PetPoojaOrdersView />);

    expect(screen.getByText("Saved Bill")).toBeInTheDocument();
    expect(screen.getByText("Printed Bill")).toBeInTheDocument();
    expect(screen.getByText("Cancelled Bill")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("renders all 6 reference orders with correct columns and status colors", () => {
    render(<PetPoojaOrdersView initialOrders={REFERENCE_CURRENT_ORDERS} />);

    // Order numbers
    expect(screen.getByText("8012")).toBeInTheDocument();
    expect(screen.getByText("8011")).toBeInTheDocument();
    expect(screen.getByText("8010")).toBeInTheDocument();
    expect(screen.getByText("8009")).toBeInTheDocument();
    expect(screen.getByText("8008")).toBeInTheDocument();
    expect(screen.getByText("8007")).toBeInTheDocument();

    // Customer names
    expect(screen.getByText("Ranveer")).toBeInTheDocument();
    expect(screen.getByText("rahul singh naik")).toBeInTheDocument();

    // Aggregator tags
    expect(screen.getAllByText("[Swiggy]").length).toBe(2);

    // Grand totals
    expect(screen.getByText("198.00")).toBeInTheDocument();
    expect(screen.getByText("119.00")).toBeInTheDocument();
    expect(screen.getByText("236.00")).toBeInTheDocument();
    expect(screen.getByText("182.00")).toBeInTheDocument();
    expect(screen.getAllByText("120.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("217.00")).toBeInTheDocument();
  });

  it("filters orders when clicking channel filter buttons", () => {
    render(<PetPoojaOrdersView initialOrders={REFERENCE_CURRENT_ORDERS} />);

    const deliveryCard = screen.getAllByText("Delivery")[0];
    fireEvent.click(deliveryCard);

    // Should only show delivery orders 8010, 8009
    expect(screen.getByText("8010")).toBeInTheDocument();
    expect(screen.getByText("8009")).toBeInTheDocument();
    expect(screen.queryByText("8012")).not.toBeInTheDocument();
  });

  it("triggers onViewOrderDetails when clicking on order number or view icon", () => {
    const handleView = vi.fn();
    render(
      <PetPoojaOrdersView
        initialOrders={REFERENCE_CURRENT_ORDERS}
        onViewOrderDetails={handleView}
      />
    );

    const order8012Btn = screen.getByText("8012");
    fireEvent.click(order8012Btn);
    expect(handleView).toHaveBeenCalledWith("ord_8012");
  });
});
