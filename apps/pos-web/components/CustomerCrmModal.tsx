import React, { useState, useEffect } from "react";
import { authedFetch } from "../lib/auth";

export interface CustomerData {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  loyaltyPoints?: number;
}

interface CustomerCrmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (cust: CustomerData) => void;
  initialPhone?: string;
}

export default function CustomerCrmModal({
  isOpen,
  onClose,
  onSelectCustomer,
  initialPhone = "",
}: CustomerCrmModalProps) {
  const [searchQuery, setSearchQuery] = useState(initialPhone);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // New Customer Form State
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState(initialPhone);
  const [newEmail, setNewEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchCustomers = async (q: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authedFetch(`/crm/customers?search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.customers || [];
        setCustomers(
          list.map((c: any) => ({
            id: c.id,
            name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Guest",
            phone: c.phone || "N/A",
            email: c.email || null,
            loyaltyPoints: Number(c.loyaltyPoints || 0),
          }))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      searchCustomers(searchQuery);
    }
  }, [isOpen]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      setErrorMsg("Name and Phone are required.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await authedFetch("/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          loyaltyPoints: 50, // Welcome reward bonus
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const custObj: CustomerData = {
          id: created.id,
          name: created.name || newName.trim(),
          phone: created.phone || newPhone.trim(),
          email: created.email || null,
          loyaltyPoints: 50,
        };
        onSelectCustomer(custObj);
        onClose();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMsg(errJson.error || "Failed to create customer record in database");
      }
    } catch {
      setErrorMsg("Network error saving customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "1.3rem" }}>👤</span>
            <div>
              <h3>Customer CRM & Loyalty Lookup</h3>
              <p>Search registered patrons or ingest new guests into PostgreSQL CRM</p>
            </div>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        {/* Search Input Bar */}
        <div className="crm-search-bar">
          <input
            type="text"
            placeholder="Search customer by mobile number or name..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchCustomers(e.target.value);
            }}
            autoFocus
          />
          <button
            type="button"
            className="btn-toggle-add"
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm && !newPhone && searchQuery) {
                setNewPhone(searchQuery);
              }
            }}
          >
            {showAddForm ? "✕ Search" : "+ Add New Guest"}
          </button>
        </div>

        {errorMsg && <div className="crm-error-banner">{errorMsg}</div>}

        {/* Add New Customer Form */}
        {showAddForm ? (
          <form onSubmit={handleCreateCustomer} className="crm-add-form">
            <h4>Ingest New Patron</h4>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Vikramaditya Sharma"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Mobile Phone *</label>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Email Address (Optional)</label>
              <input
                type="email"
                placeholder="guest@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving to Database..." : "Save & Tag to Bill"}
              </button>
            </div>
          </form>
        ) : (
          /* Customer List Feed */
          <div className="crm-results-list">
            {loading ? (
              <div className="crm-loading">Searching customer database...</div>
            ) : customers.length === 0 ? (
              <div className="crm-empty">
                <span>🔍</span>
                <p>No customer found matching "{searchQuery}".</p>
                <button
                  type="button"
                  className="btn-create-prompt"
                  onClick={() => {
                    setShowAddForm(true);
                    setNewPhone(searchQuery);
                  }}
                >
                  + Add "{searchQuery}" as New Customer
                </button>
              </div>
            ) : (
              customers.map((c) => (
                <div
                  key={c.id}
                  className="crm-customer-tile"
                  onClick={() => {
                    onSelectCustomer(c);
                    onClose();
                  }}
                >
                  <div className="cust-main-info">
                    <strong>{c.name}</strong>
                    <span>📞 {c.phone}</span>
                    {c.email && <span>✉️ {c.email}</span>}
                  </div>
                  <div className="cust-loyalty-badge">
                    <span className="pts-count">{c.loyaltyPoints || 0} Pts</span>
                    <span className="loyalty-tier">⭐ Gold Tier</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .crm-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100001;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease-out;
        }
        .crm-modal-card {
          width: 500px;
          max-width: 92vw;
          max-height: 85vh;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .crm-modal-header {
          padding: 16px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .crm-modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: #0f172a;
        }
        .crm-modal-header p {
          margin: 2px 0 0;
          font-size: 0.72rem;
          color: #64748b;
        }
        .btn-close-modal {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 1.2rem;
          cursor: pointer;
        }
        .crm-search-bar {
          padding: 14px 20px;
          display: flex;
          gap: 10px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
        }
        .crm-search-bar input {
          flex: 1;
          padding: 9px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
        }
        .crm-search-bar input:focus {
          outline: none;
          border-color: #3b82f6;
        }
        .btn-toggle-add {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          padding: 0 14px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .crm-error-banner {
          margin: 0 20px 10px;
          padding: 8px 12px;
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
          border-radius: 6px;
          font-size: 0.75rem;
        }
        .crm-add-form {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .crm-add-form h4 {
          margin: 0 0 4px;
          font-size: 0.9rem;
          font-weight: 800;
          color: #1e293b;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .form-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
        }
        .form-group input {
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.82rem;
        }
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
        .btn-cancel {
          background: #f1f5f9;
          border: none;
          color: #475569;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-submit {
          background: #10b981;
          border: none;
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }
        .crm-results-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 360px;
        }
        .crm-loading {
          text-align: center;
          padding: 30px;
          color: #64748b;
          font-size: 0.82rem;
        }
        .crm-empty {
          text-align: center;
          padding: 30px 20px;
          color: #64748b;
        }
        .btn-create-prompt {
          background: #10b981;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          margin-top: 10px;
        }
        .crm-customer-tile {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.12s;
        }
        .crm-customer-tile:hover {
          border-color: #3b82f6;
          background: #f8fafc;
        }
        .cust-main-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .cust-main-info strong {
          font-size: 0.85rem;
          color: #0f172a;
        }
        .cust-main-info span {
          font-size: 0.72rem;
          color: #64748b;
        }
        .cust-loyalty-badge {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .pts-count {
          font-size: 0.82rem;
          font-weight: 800;
          color: #d97706;
        }
        .loyalty-tier {
          font-size: 0.65rem;
          background: #fef3c7;
          color: #92400e;
          padding: 1px 6px;
          border-radius: 999px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
