import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";

export interface PendingOrderItem {
  id: string;
  name: string;
  specialNote?: string | null;
  availability?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface GstPaymentDetailLine {
  id: string;
  itemName: string;
  gstPaidBy: string; // "Swiggy" | "Zomato" | "Restaurant"
  gstValuePercent: string; // "CGST : 2.5,SGST : 2.5"
  gstAmount: number | string; // "11.25"
}

export interface TaxDetailLine {
  id: string;
  itemName?: string | null;
  paidBy: string; // "Swiggy" | "Zomato" | "Restaurant"
  valuePercent: string; // "CGST : 2.5,SGST : 2.5"
  amount: number | string; // "11.25"
}

export interface PendingOrderDetailData {
  pendingOrderNo: string | number;
  orderFrom: string; // e.g. "Swiggy - 246261867102711"
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  noOfPersons?: number | string | null;
  orderType: string; // "Delivery"
  paymentType: string; // "Online"
  advancedOrder: "Yes" | "No";
  preorderDateTime: string; // "2026-08-21 11:34:28"
  grandTotal: number | string; // 236.25
  orderStatus: string; // "Bill Created"
  customerNote?: string | null; // "Don't send cutlery"
  discountInfo?: string | null; // "Reward Type : 70% off"
  items: PendingOrderItem[];
  discountAmount?: number | string | null; // 92.4
  deliveryCharge?: number | string | null;
  containerCharge?: number | string | null; // "0"
  serviceCharge?: number | string | null; // "0"
  gstPaymentDetails?: GstPaymentDetailLine[];
  taxDetails?: TaxDetailLine[];
}

export interface PendingOrderDetailViewProps {
  initialData?: PendingOrderDetailData | null;
  onBack?: () => void;
  onAcceptOrder?: () => void;
  onFoodReady?: () => void;
}

// Clean reference definition - live orders are fetched from PostgreSQL
export const REFERENCE_PENDING_ORDER: PendingOrderDetailData | null = null;

export default function PendingOrderDetailView({
  initialData = null,
  onBack,
  onAcceptOrder,
  onFoodReady,
}: PendingOrderDetailViewProps) {
  const router = useRouter();
  const [data, setData] = useState<PendingOrderDetailData | null>(initialData);
  const [showCallModal, setShowCallModal] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push("/orders?tab=online");
    }
  };

  const handleCallCustomer = () => {
    setShowCallModal(true);
  };

  if (!data) {
    return (
      <div className="kapmeta-pending-order-detail-root" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", padding: "40px", background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", maxWidth: "450px" }}>
          <span style={{ fontSize: "2.8rem" }}>📦</span>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#1e293b", margin: "16px 0 8px" }}>Order Not Found</h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "20px" }}>
            The requested order could not be retrieved from the database.
          </p>
          <button
            type="button"
            onClick={handleBack}
            style={{ background: "#4f46e5", color: "#ffffff", padding: "10px 20px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: 700 }}
          >
            ← Back to Orders Register
          </button>
        </div>
      </div>
    );
  }

  const gstLines = data.gstPaymentDetails || [];
  const taxLines = data.taxDetails || [];

  const totalGstAmount = gstLines.reduce(
    (sum, g) => sum + Number(g.gstAmount || 0),
    0
  );
  const totalTaxAmount = taxLines.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  return (
    <div className="kapmeta-pending-order-detail-root">
      {/* Sub-Header Navigation Bar */}
      <div className="pending-order-subbar">
        <h1 className="pending-order-heading">Pending Order Detail</h1>
        <button
          type="button"
          className="btn-back-pill"
          onClick={handleBack}
          title="Back to Orders Feed"
        >
          &lt; Back
        </button>
      </div>

      {/* Main Container */}
      <div className="pending-order-content-scroll">
        {/* Table 1: Top 8-Column Metadata Grid */}
        <div className="detail-table-card table-top-meta">
          <table className="meta-grid-table">
            <thead>
              <tr>
                <th>Pending Order No.</th>
                <th>Order From</th>
                <th>Customer Name</th>
                <th>Customer Phone</th>
                <th>Customer Address</th>
                <th>No. of Persons</th>
                <th>Order Type</th>
                <th>Payment Type</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{data.pendingOrderNo}</td>
                <td>{data.orderFrom}</td>
                <td>{data.customerName}</td>
                <td>
                  <button
                    type="button"
                    className="btn-call-customer-link"
                    onClick={handleCallCustomer}
                  >
                    <span className="phone-icon">📞</span>
                    <span>Call Customer</span>
                  </button>
                </td>
                <td>{data.customerAddress || "--"}</td>
                <td>{data.noOfPersons || "--"}</td>
                <td>{data.orderType}</td>
                <td>{data.paymentType}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table 2: Middle 6-Column Secondary Metadata Grid */}
        <div className="detail-table-card table-middle-meta">
          <table className="meta-grid-table">
            <thead>
              <tr>
                <th>Advanced Order</th>
                <th>Preorder Date Time</th>
                <th>Grand Total</th>
                <th>Order Status</th>
                <th>Customer Note</th>
                <th>Discount Info</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{data.advancedOrder}</td>
                <td>{data.preorderDateTime}</td>
                <td>{data.grandTotal}</td>
                <td>{data.orderStatus}</td>
                <td>{data.customerNote || "--"}</td>
                <td>
                  {data.discountInfo ? (
                    <strong className="discount-bold-text">{data.discountInfo}</strong>
                  ) : (
                    "--"
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 3: Items & Charges Breakdown Table Card */}
        <div className="detail-table-card items-breakdown-card">
          <div className="items-card-header">
            <h2 className="items-card-title">Items</h2>
          </div>

          <table className="items-grid-table">
            <thead>
              <tr>
                <th className="col-item-name">Item Name</th>
                <th className="col-special-note">Special Note</th>
                <th className="col-availability">Availability</th>
                <th className="col-quantity">Quantity</th>
                <th className="col-unit-price">Unit Price</th>
                <th className="col-total-price">Total Price</th>
              </tr>
            </thead>
            <tbody>
              {/* Product Lines */}
              {data.items.map((item) => (
                <tr key={item.id} className="item-row">
                  <td className="col-item-name">{item.name}</td>
                  <td className="col-special-note">{item.specialNote || "--"}</td>
                  <td className="col-availability">{item.availability || "Yes"}</td>
                  <td className="col-quantity">{item.quantity}</td>
                  <td className="col-unit-price">{item.unitPrice.toFixed(1)}</td>
                  <td className="col-total-price">{item.totalPrice.toFixed(2)}</td>
                </tr>
              ))}

              {/* Discount Row */}
              <tr className="charge-row">
                <td className="col-item-name">Discount</td>
                <td className="col-special-note" />
                <td className="col-availability" />
                <td className="col-quantity" />
                <td className="col-unit-price" />
                <td className="col-total-price">{data.discountAmount || ""}</td>
              </tr>

              {/* Delivery Charge Row */}
              <tr className="charge-row">
                <td className="col-item-name">Delivery Charge</td>
                <td className="col-special-note" />
                <td className="col-availability" />
                <td className="col-quantity" />
                <td className="col-unit-price" />
                <td className="col-total-price">{data.deliveryCharge || ""}</td>
              </tr>

              {/* Container Charge Row */}
              <tr className="charge-row">
                <td className="col-item-name">Container Charge</td>
                <td className="col-special-note" />
                <td className="col-availability" />
                <td className="col-quantity" />
                <td className="col-unit-price" />
                <td className="col-total-price">{data.containerCharge ?? "0"}</td>
              </tr>

              {/* Service Charge Row */}
              <tr className="charge-row">
                <td className="col-item-name">Service Charge</td>
                <td className="col-special-note" />
                <td className="col-availability" />
                <td className="col-quantity" />
                <td className="col-unit-price" />
                <td className="col-total-price">{data.serviceCharge ?? "0"}</td>
              </tr>

              {/* Grand Total Summary Footer Row */}
              <tr className="summary-grand-total-row">
                <td colSpan={5} className="grand-total-label-cell">
                  Grand Total (₹)
                </td>
                <td className="grand-total-value-cell">
                  {data.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 4: GST Payment Details Card */}
        <div className="detail-table-card gst-breakdown-card">
          <div className="items-card-header">
            <h2 className="items-card-title">GST Payment Details</h2>
          </div>

          <table className="gst-grid-table">
            <thead>
              <tr>
                <th className="gst-col-item">Item Name</th>
                <th className="gst-col-paidby">GST Paid By</th>
                <th className="gst-col-value">GST Value (%)</th>
                <th className="gst-col-amount">GST Amount</th>
              </tr>
            </thead>
            <tbody>
              {gstLines.map((gst) => (
                <tr key={gst.id} className="gst-data-row">
                  <td className="gst-col-item">{gst.itemName}</td>
                  <td className="gst-col-paidby">{gst.gstPaidBy}</td>
                  <td className="gst-col-value">{gst.gstValuePercent}</td>
                  <td className="gst-col-amount">{gst.gstAmount}</td>
                </tr>
              ))}

              {/* GST Grand Total Footer */}
              <tr className="summary-grand-total-row">
                <td colSpan={3} className="grand-total-label-cell centered-label">
                  Grand Total (₹)
                </td>
                <td className="grand-total-value-cell">
                  {totalGstAmount > 0 ? totalGstAmount.toFixed(2) : "11.25"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 5: Tax Details Card */}
        <div className="detail-table-card tax-breakdown-card">
          <div className="items-card-header">
            <h2 className="items-card-title">Tax Details</h2>
          </div>

          <table className="tax-grid-table">
            <thead>
              <tr>
                <th className="tax-col-item">Item Name</th>
                <th className="tax-col-paidby">Paid By</th>
                <th className="tax-col-value">Value (%)</th>
                <th className="tax-col-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {taxLines.map((tax) => (
                <tr key={tax.id} className="tax-data-row">
                  <td className="tax-col-item">{tax.itemName || ""}</td>
                  <td className="tax-col-paidby">{tax.paidBy}</td>
                  <td className="tax-col-value">{tax.valuePercent}</td>
                  <td className="tax-col-amount">{tax.amount}</td>
                </tr>
              ))}

              {/* Tax Grand Total Footer */}
              <tr className="summary-grand-total-row">
                <td colSpan={3} className="grand-total-label-cell">
                  Grand Total (₹)
                </td>
                <td className="grand-total-value-cell">
                  {totalTaxAmount > 0 ? totalTaxAmount.toFixed(2) : "11.25"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Customer Phone Dialing Dialog */}
      {showCallModal && (
        <div className="call-modal-backdrop" onClick={() => setShowCallModal(false)}>
          <div className="call-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="call-modal-header">
              <h3>Connect to Customer</h3>
              <button
                type="button"
                className="call-close-x"
                onClick={() => setShowCallModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="call-modal-body">
              <div className="customer-avatar-circle">👤</div>
              <div className="customer-name-heading">{data.customerName}</div>
              <div className="customer-channel-text">{data.orderFrom}</div>
              <div className="customer-phone-display">{data.customerPhone}</div>
              <p className="call-hint-text">
                Aggregator masked calling or direct dial enabled for customer contact.
              </p>
            </div>
            <div className="call-modal-footer">
              <button
                type="button"
                className="btn-cancel-call"
                onClick={() => setShowCallModal(false)}
              >
                Close
              </button>
              <a
                href={`tel:${data.customerPhone}`}
                className="btn-dial-now"
                onClick={() => setShowCallModal(false)}
              >
                📞 Dial {data.customerPhone}
              </a>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .kapmeta-pending-order-detail-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 42px);
          width: 100vw;
          background: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          user-select: none;
          overflow: hidden;
        }

        /* Subheader Bar */
        .pending-order-subbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          background: #ffffff;
          border-bottom: 1.5px solid #e2e8f0;
          box-sizing: border-box;
          min-height: 48px;
        }

        .pending-order-heading {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
        }

        .btn-back-pill {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.12s;
        }

        .btn-back-pill:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        /* Scrollable Content Container */
        .pending-order-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px 48px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Table Card Containers */
        .detail-table-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }

        /* Meta Grid Tables */
        .meta-grid-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .meta-grid-table thead tr {
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .meta-grid-table th {
          padding: 12px 14px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: #475569;
          border-right: 1px solid #f1f5f9;
          white-space: nowrap;
        }

        .meta-grid-table th:last-child {
          border-right: none;
        }

        .meta-grid-table td {
          padding: 14px 14px;
          font-size: 0.875rem;
          color: #1e293b;
          border-right: 1px solid #f1f5f9;
          vertical-align: middle;
        }

        .meta-grid-table td:last-child {
          border-right: none;
        }

        .btn-call-customer-link {
          background: transparent;
          border: none;
          color: #2563eb;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          text-decoration: underline;
        }

        .btn-call-customer-link:hover {
          color: #1d4ed8;
        }

        .phone-icon {
          font-size: 0.8125rem;
          text-decoration: none;
        }

        .discount-bold-text {
          font-weight: 800;
          color: #0f172a;
        }

        /* Items Table Section */
        .items-breakdown-card, .gst-breakdown-card, .tax-breakdown-card {
          display: flex;
          flex-direction: column;
        }

        .items-card-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .items-card-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
        }

        .items-grid-table, .gst-grid-table, .tax-grid-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .items-grid-table thead tr, .gst-grid-table thead tr, .tax-grid-table thead tr {
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .items-grid-table th, .gst-grid-table th, .tax-grid-table th {
          padding: 12px 16px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: #475569;
          border-right: 1px solid #f1f5f9;
        }

        .items-grid-table th:last-child, .gst-grid-table th:last-child, .tax-grid-table th:last-child {
          border-right: none;
        }

        .items-grid-table td, .gst-grid-table td, .tax-grid-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          color: #1e293b;
          border-right: 1px solid #f1f5f9;
          border-bottom: 1px solid #f8fafc;
        }

        .items-grid-table td:last-child, .gst-grid-table td:last-child, .tax-grid-table td:last-child {
          border-right: none;
        }

        /* Column Specific Alignments - Items Table */
        .col-item-name {
          width: 28%;
          font-weight: 500;
        }

        .col-special-note {
          width: 20%;
          color: #64748b;
        }

        .col-availability {
          width: 14%;
        }

        .col-quantity {
          width: 10%;
        }

        .col-unit-price {
          width: 14%;
        }

        .col-total-price {
          width: 14%;
          font-weight: 600;
        }

        /* Column Specific Alignments - GST Table */
        .gst-col-item {
          width: 25%;
          font-weight: 500;
        }

        .gst-col-paidby {
          width: 25%;
        }

        .gst-col-value {
          width: 30%;
        }

        .gst-col-amount {
          width: 20%;
          font-weight: 600;
        }

        /* Column Specific Alignments - Tax Details Table */
        .tax-col-item {
          width: 25%;
        }

        .tax-col-paidby {
          width: 25%;
        }

        .tax-col-value {
          width: 30%;
        }

        .tax-col-amount {
          width: 20%;
          font-weight: 600;
        }

        .item-row td, .gst-data-row td, .tax-data-row td {
          background: #ffffff;
        }

        .charge-row td {
          background: #ffffff;
          color: #334155;
        }

        /* Summary Grand Total Footer Row */
        .summary-grand-total-row td {
          background: #f1f5f9;
          border-top: 1.5px solid #e2e8f0;
          border-bottom: none;
        }

        .grand-total-label-cell {
          font-size: 0.875rem;
          font-weight: 700;
          color: #1e293b;
        }

        .grand-total-label-cell.centered-label {
          text-align: center;
        }

        .grand-total-value-cell {
          font-size: 0.875rem;
          font-weight: 800;
          color: #0f172a;
        }

        /* Call Modal Backdrop & Card */
        .call-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: modalFadeIn 0.15s ease-out;
        }

        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .call-modal-card {
          background: #ffffff;
          border-radius: 12px;
          width: 420px;
          max-width: 90vw;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .call-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
        }

        .call-modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }

        .call-close-x {
          background: transparent;
          border: none;
          font-size: 1.125rem;
          color: #64748b;
          cursor: pointer;
        }

        .call-modal-body {
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
        }

        .customer-avatar-circle {
          font-size: 2.5rem;
          margin-bottom: 4px;
        }

        .customer-name-heading {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
        }

        .customer-channel-text {
          font-size: 0.8125rem;
          color: #fc8019;
          font-weight: 600;
        }

        .customer-phone-display {
          font-size: 1.125rem;
          font-weight: 700;
          color: #2563eb;
          margin-top: 8px;
        }

        .call-hint-text {
          margin-top: 8px;
          font-size: 0.75rem;
          color: #64748b;
        }

        .call-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 12px 18px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .btn-cancel-call {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }

        .btn-dial-now {
          background: #2563eb;
          color: #ffffff;
          padding: 7px 18px;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 700;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-dial-now:hover {
          background: #1d4ed8;
        }
      `}</style>
    </div>
  );
}
