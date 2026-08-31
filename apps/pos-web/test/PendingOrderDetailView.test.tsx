import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PendingOrderDetailView, {
  REFERENCE_PENDING_ORDER,
} from "../components/PendingOrderDetailView";

describe("PendingOrderDetailView Component", () => {
  it("renders the subheader with heading and Back button", () => {
    const handleBack = vi.fn();
    render(<PendingOrderDetailView onBack={handleBack} />);

    expect(screen.getByText("Pending Order Detail")).toBeInTheDocument();
    const backBtn = screen.getByText("< Back");
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("renders the 8-column top metadata table matching the screenshot", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    // Table Headers
    expect(screen.getByText("Pending Order No.")).toBeInTheDocument();
    expect(screen.getByText("Order From")).toBeInTheDocument();
    expect(screen.getByText("Customer Name")).toBeInTheDocument();
    expect(screen.getByText("Customer Phone")).toBeInTheDocument();
    expect(screen.getByText("Customer Address")).toBeInTheDocument();
    expect(screen.getByText("No. of Persons")).toBeInTheDocument();
    expect(screen.getByText("Order Type")).toBeInTheDocument();
    expect(screen.getByText("Payment Type")).toBeInTheDocument();

    // Data values
    expect(screen.getByText("40469")).toBeInTheDocument();
    expect(screen.getByText("Swiggy - 246261867102711")).toBeInTheDocument();
    expect(screen.getByText("Ranveer")).toBeInTheDocument();
    expect(screen.getByText("Call Customer")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders the 6-column middle metadata table with discount and notes", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    // Table Headers
    expect(screen.getByText("Advanced Order")).toBeInTheDocument();
    expect(screen.getByText("Preorder Date Time")).toBeInTheDocument();
    expect(screen.getAllByText("Grand Total").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Order Status")).toBeInTheDocument();
    expect(screen.getByText("Customer Note")).toBeInTheDocument();
    expect(screen.getByText("Discount Info")).toBeInTheDocument();

    // Data values
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("2026-08-21 11:34:28")).toBeInTheDocument();
    expect(screen.getAllByText("236.25").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bill Created")).toBeInTheDocument();
    expect(screen.getByText("Don't send cutlery")).toBeInTheDocument();
    expect(screen.getByText("Reward Type : 70% off")).toBeInTheDocument();
  });

  it("renders the items and charges breakdown table with Grand Total (₹) 236.25", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    // Section title
    expect(screen.getByText("Items")).toBeInTheDocument();

    // Column Headers
    expect(screen.getAllByText("Item Name").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Special Note")).toBeInTheDocument();
    expect(screen.getByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("Quantity")).toBeInTheDocument();
    expect(screen.getByText("Unit Price")).toBeInTheDocument();
    expect(screen.getByText("Total Price")).toBeInTheDocument();

    // Item line: Poori
    expect(screen.getAllByText("Poori").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("158.7")).toBeInTheDocument();
    expect(screen.getByText("317.40")).toBeInTheDocument();

    // Charge lines: Discount, Delivery, Container, Service
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("92.4")).toBeInTheDocument();
    expect(screen.getByText("Delivery Charge")).toBeInTheDocument();
    expect(screen.getByText("Container Charge")).toBeInTheDocument();
    expect(screen.getByText("Service Charge")).toBeInTheDocument();

    // Grand Total footer
    expect(screen.getAllByText("Grand Total (₹)").length).toBe(3);
    expect(screen.getAllByText("236.25").length).toBe(2);
  });

  it("renders the GST Payment Details card with Swiggy and 11.25", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    expect(screen.getByText("GST Payment Details")).toBeInTheDocument();
    expect(screen.getByText("GST Paid By")).toBeInTheDocument();
    expect(screen.getByText("GST Value (%)")).toBeInTheDocument();
    expect(screen.getByText("GST Amount")).toBeInTheDocument();

    expect(screen.getAllByText("CGST : 2.5,SGST : 2.5").length).toBe(2);
    expect(screen.getAllByText("11.25").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the Tax Details card matching the screenshot", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    expect(screen.getByText("Tax Details")).toBeInTheDocument();
    expect(screen.getByText("Paid By")).toBeInTheDocument();
    expect(screen.getByText("Value (%)")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();

    expect(screen.getAllByText("Swiggy").length).toBeGreaterThanOrEqual(2);
  });

  it("opens the customer call dialog when Call Customer is clicked", () => {
    render(<PendingOrderDetailView initialData={REFERENCE_PENDING_ORDER} />);

    const callBtn = screen.getByText("Call Customer");
    fireEvent.click(callBtn);

    expect(screen.getByText("Connect to Customer")).toBeInTheDocument();
    expect(screen.getByText("+91 98765 43210")).toBeInTheDocument();
    expect(screen.getByText("📞 Dial +91 98765 43210")).toBeInTheDocument();

    const closeBtn = screen.getByText("Close");
    fireEvent.click(closeBtn);

    expect(screen.queryByText("Connect to Customer")).not.toBeInTheDocument();
  });
});
