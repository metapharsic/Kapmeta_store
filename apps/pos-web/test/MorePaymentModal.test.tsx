import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MorePaymentModal from "../components/MorePaymentModal";

describe("MorePaymentModal Component", () => {
  it("renders all 6 top payment methods and the collapsible Other section", () => {
    const handleClose = vi.fn();
    const handleSelectMethod = vi.fn();

    render(
      <MorePaymentModal
        isOpen={true}
        onClose={handleClose}
        currentMethod="UPI"
        isPaid={true}
        totalMinor={45000}
        onSelectMethod={handleSelectMethod}
      />
    );

    // Verify Title
    expect(screen.getByText("More")).toBeInTheDocument();

    // Verify 6 Primary Payment Method cards
    expect(screen.getByText("Not Paid")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.getAllByText("UPI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Part")).toBeInTheDocument();

    // Verify Other section
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("Room Service")).toBeInTheDocument();
  });

  it("selects Not Paid and marks as unpaid", () => {
    const handleSelectMethod = vi.fn();
    render(
      <MorePaymentModal
        isOpen={true}
        onClose={vi.fn()}
        currentMethod="CASH"
        isPaid={true}
        totalMinor={45000}
        onSelectMethod={handleSelectMethod}
      />
    );

    fireEvent.click(screen.getByText("Not Paid"));
    expect(handleSelectMethod).toHaveBeenCalledWith("NOT_PAID", { isPaid: false });
  });

  it("selects Cash tender and marks as paid", () => {
    const handleSelectMethod = vi.fn();
    render(
      <MorePaymentModal
        isOpen={true}
        onClose={vi.fn()}
        currentMethod="NOT_PAID"
        isPaid={false}
        totalMinor={45000}
        onSelectMethod={handleSelectMethod}
      />
    );

    fireEvent.click(screen.getByText("Cash"));
    expect(handleSelectMethod).toHaveBeenCalledWith("CASH", { isPaid: true });
  });

  it("opens Part split handler when Part card is clicked", () => {
    const handleOpenSplit = vi.fn();
    render(
      <MorePaymentModal
        isOpen={true}
        onClose={vi.fn()}
        currentMethod="CASH"
        isPaid={true}
        totalMinor={45000}
        onSelectMethod={vi.fn()}
        onOpenSplitModal={handleOpenSplit}
      />
    );

    fireEvent.click(screen.getByText("Part"));
    expect(handleOpenSplit).toHaveBeenCalled();
  });

  it("opens Room Service room prompt dialog when Room Service is clicked", () => {
    render(
      <MorePaymentModal
        isOpen={true}
        onClose={vi.fn()}
        currentMethod="CASH"
        isPaid={true}
        totalMinor={45000}
        onSelectMethod={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Room Service"));
    expect(screen.getByText("Room Service Settlement")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 204, Suite 101")).toBeInTheDocument();
  });

  it("toggles Other accordion open and closed", () => {
    render(
      <MorePaymentModal
        isOpen={true}
        onClose={vi.fn()}
        currentMethod="CASH"
        isPaid={true}
        totalMinor={45000}
        onSelectMethod={vi.fn()}
      />
    );

    expect(screen.getByText("Room Service")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Other"));
    expect(screen.queryByText("Room Service")).not.toBeInTheDocument();
  });
});
