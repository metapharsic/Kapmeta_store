import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PetPoojaKotView, { REFERENCE_KOT_TICKETS } from "../components/PetPoojaKotView";

describe("PetPoojaKotView Component", () => {
  it("renders the subheader with Order View, Kot View, New View, Old View, and Back button", () => {
    render(<PetPoojaKotView />);

    expect(screen.getByText("Order View")).toBeInTheDocument();
    expect(screen.getByText("Kot View")).toBeInTheDocument();
    expect(screen.getByText("New View")).toBeInTheDocument();
    expect(screen.getByText("Old View")).toBeInTheDocument();
    expect(screen.getByText("< Back")).toBeInTheDocument();
  });

  it("renders the status indicators legend with Delivery, Limit Exceed, Swiggy, Zomato, Dine In, Pick Up", () => {
    render(<PetPoojaKotView />);

    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Limit Exceed")).toBeInTheDocument();
    expect(screen.getByText("Swiggy")).toBeInTheDocument();
    expect(screen.getByText("Zomato")).toBeInTheDocument();
    expect(screen.getByText("Dine In")).toBeInTheDocument();
    expect(screen.getAllByText("Pick Up").length).toBeGreaterThan(1);
  });

  it("renders all 8 reference KOT cards from the screenshot", () => {
    render(<PetPoojaKotView initialTickets={REFERENCE_KOT_TICKETS} />);

    // KOT Numbers
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("46")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();

    // Specific Items
    expect(screen.getByText("Upma")).toBeInTheDocument();
    expect(screen.getByText("Filter Coffee")).toBeInTheDocument();
    expect(screen.getByText("Whole Wheat Biscuits 200gm")).toBeInTheDocument();
    expect(screen.getByText("Masala Dosa")).toBeInTheDocument();
    expect(screen.getByText("(2) Idly (1) Vada")).toBeInTheDocument();
    expect(screen.getByText("Ghee Podi Dosa")).toBeInTheDocument();
    expect(screen.getByText("Salt Biscuits 200gm")).toBeInTheDocument();
    expect(screen.getByText("Onion Uttapam")).toBeInTheDocument();

    // Table/order tags
    expect(screen.getAllByText("b18").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("b14")).toBeInTheDocument();
    expect(screen.getByText("b3")).toBeInTheDocument();
  });

  it("marks KOT Food Ready on button click", () => {
    const handleMarkReady = vi.fn();
    render(
      <PetPoojaKotView
        initialTickets={REFERENCE_KOT_TICKETS}
        onMarkFoodReady={handleMarkReady}
      />
    );

    const buttons = screen.getAllByText("Food Is Ready");
    expect(buttons.length).toBe(8);

    fireEvent.click(buttons[0]);
    expect(handleMarkReady).toHaveBeenCalledWith("kot_14");
    expect(screen.getByText("✓ Ready")).toBeInTheDocument();
  });

  it("filters KOT cards using the quick search input", () => {
    render(<PetPoojaKotView initialTickets={REFERENCE_KOT_TICKETS} />);

    const searchInput = screen.getByPlaceholderText("Enter kot/Order no.");
    fireEvent.change(searchInput, { target: { value: "Upma" } });

    expect(screen.getByText("Upma")).toBeInTheDocument();
    expect(screen.queryByText("Masala Dosa")).not.toBeInTheDocument();
  });

  it("marks KOT ready via the MFR button", () => {
    const handleMarkReady = vi.fn();
    render(
      <PetPoojaKotView
        initialTickets={REFERENCE_KOT_TICKETS}
        onMarkFoodReady={handleMarkReady}
      />
    );

    const searchInput = screen.getByPlaceholderText("Enter kot/Order no.");
    fireEvent.change(searchInput, { target: { value: "26" } });

    const mfrButton = screen.getByText("MFR");
    fireEvent.click(mfrButton);

    expect(handleMarkReady).toHaveBeenCalledWith("kot_26");
  });
});
