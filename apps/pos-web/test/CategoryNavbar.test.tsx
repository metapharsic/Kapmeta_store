import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CategoryNavbar, { DietaryFilter } from "../components/menu/CategoryNavbar";

describe("CategoryNavbar Component", () => {
  const mockCategories = ["All", "Breakfast", "Curry", "Rice", "Desserts"];
  const mockCounts = {
    All: 25,
    Breakfast: 5,
    Curry: 8,
    Rice: 7,
    Desserts: 5,
  };

  it("renders search input, dietary pills, and category list with item counts", () => {
    const handleSelectCategory = vi.fn();
    const handleChangeDietary = vi.fn();
    const handleSearchChange = vi.fn();

    render(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="All"
        onSelectCategory={handleSelectCategory}
        dietaryFilter="ALL"
        onChangeDietaryFilter={handleChangeDietary}
        searchQuery=""
        onSearchChange={handleSearchChange}
        categoryItemCounts={mockCounts}
        layout="horizontal"
      />
    );

    // Search bar
    expect(screen.getByPlaceholderText(/Search items by name/i)).toBeInTheDocument();

    // Dietary filter pills & category chips
    expect(screen.getAllByText("All").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pure Veg")).toBeInTheDocument();
    expect(screen.getByText("Non-Veg")).toBeInTheDocument();
    expect(screen.getByText("⭐ Bestsellers")).toBeInTheDocument();

    // Categories
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.getByText("Curry")).toBeInTheDocument();
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("Desserts")).toBeInTheDocument();

    // Count badges
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("handles category selection", () => {
    const handleSelectCategory = vi.fn();

    render(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="All"
        onSelectCategory={handleSelectCategory}
        dietaryFilter="ALL"
        onChangeDietaryFilter={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        categoryItemCounts={mockCounts}
      />
    );

    const curryBtn = screen.getByText("Curry");
    fireEvent.click(curryBtn);
    expect(handleSelectCategory).toHaveBeenCalledWith("Curry");
  });

  it("handles dietary filter change", () => {
    const handleChangeDietary = vi.fn();

    render(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        dietaryFilter="ALL"
        onChangeDietaryFilter={handleChangeDietary}
        searchQuery=""
        onSearchChange={vi.fn()}
      />
    );

    const vegBtn = screen.getByText("Pure Veg");
    fireEvent.click(vegBtn);
    expect(handleChangeDietary).toHaveBeenCalledWith("VEG_ONLY");

    const bestsellersBtn = screen.getByText("⭐ Bestsellers");
    fireEvent.click(bestsellersBtn);
    expect(handleChangeDietary).toHaveBeenCalledWith("BESTSELLERS_ONLY");
  });

  it("handles search input change and clear button", () => {
    const handleSearchChange = vi.fn();

    const { rerender } = render(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        dietaryFilter="ALL"
        onChangeDietaryFilter={vi.fn()}
        searchQuery=""
        onSearchChange={handleSearchChange}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search items by name/i);
    fireEvent.change(searchInput, { target: { value: "paneer" } });
    expect(handleSearchChange).toHaveBeenCalledWith("paneer");

    // Rerender with search query active to see clear button
    rerender(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        dietaryFilter="ALL"
        onChangeDietaryFilter={vi.fn()}
        searchQuery="paneer"
        onSearchChange={handleSearchChange}
      />
    );

    const clearBtn = screen.getByText("✕");
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(handleSearchChange).toHaveBeenCalledWith("");
  });

  it("renders properly with vertical layout", () => {
    render(
      <CategoryNavbar
        categories={mockCategories}
        selectedCategory="Breakfast"
        onSelectCategory={vi.fn()}
        dietaryFilter="ALL"
        onChangeDietaryFilter={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        layout="vertical"
      />
    );

    expect(screen.getByText("Categories")).toBeInTheDocument();
  });
});
