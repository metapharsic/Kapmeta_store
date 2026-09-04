import React, { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

export interface DeviceMappingItem {
  id: string;
  outletId: string;
  name: string;
  deviceCode: string;
  deviceType: "POS_TERMINAL" | "KDS_DISPLAY" | "WAITER_TABLET" | "CAPTAIN_DEVICE" | "KOT_PRINTER" | "BILL_PRINTER" | "CUSTOMER_DISPLAY";
  ipAddress: string | null;
  port: number;
  macAddress: string | null;
  stationId: string | null;
  stationName: string | null;
  areaId: string | null;
  areaName: string | null;
  printerIp: string | null;
  printerPort: number;
  paperWidth: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
  capabilities: {
    autoPrintKot?: boolean;
    autoPrintBill?: boolean;
    soundAlerts?: boolean;
    allowCash?: boolean;
    allowDiscount?: boolean;
  };
  status: "ONLINE" | "OFFLINE" | "STANDBY";
  lastPingAt: string | null;
  latencyMs: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface DeviceOptions {
  stations: Array<{ id: string; name: string; printerIp?: string; slaWarningSeconds?: number }>;
  areas: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; userCode?: string }>;
  defaultPrintSettings?: {
    printerName?: string;
    paperWidthMm?: number;
    autoPrintKot?: boolean;
    autoPrintBill?: boolean;
  } | null;
  deviceTypes: Array<{ id: string; label: string; icon: string }>;
}

const DEVICE_TYPE_ICONS: Record<string, string> = {
  POS_TERMINAL: "💻",
  KDS_DISPLAY: "🍳",
  WAITER_TABLET: "📱",
  CAPTAIN_DEVICE: "📋",
  KOT_PRINTER: "🖨️",
  BILL_PRINTER: "🧾",
  CUSTOMER_DISPLAY: "🖥️",
};

const DEVICE_TYPE_LABELS: Record<string, string> = {
  POS_TERMINAL: "Billing POS",
  KDS_DISPLAY: "Kitchen KDS",
  WAITER_TABLET: "Waiter Tab",
  CAPTAIN_DEVICE: "Captain Tab",
  KOT_PRINTER: "KOT Printer",
  BILL_PRINTER: "Receipt Printer",
  CUSTOMER_DISPLAY: "Customer Display",
};

const FILTER_TABS = [
  { id: "ALL", label: "All Devices" },
  { id: "POS_TERMINAL", label: "POS Terminals" },
  { id: "KDS_DISPLAY", label: "Kitchen Displays (KDS)" },
  { id: "WAITER_TABLET", label: "Waiter & Captain" },
  { id: "KOT_PRINTER", label: "Thermal Printers" },
  { id: "CUSTOMER_DISPLAY", label: "Customer Displays" },
];

export default function DeviceMappingPage() {
  const { me, loading: authLoading } = useAuthGuard("report.read");
  const [devices, setDevices] = useState<DeviceMappingItem[]>([]);
  const [options, setOptions] = useState<DeviceOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceMappingItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    deviceCode: "",
    deviceType: "POS_TERMINAL" as DeviceMappingItem["deviceType"],
    ipAddress: "",
    port: 9100,
    macAddress: "",
    stationId: "",
    areaId: "",
    printerIp: "",
    printerPort: 9100,
    paperWidth: 80,
    assignedUserId: "",
    autoPrintKot: true,
    autoPrintBill: true,
    soundAlerts: true,
    allowCash: true,
    allowDiscount: true,
    isActive: true,
    status: "ONLINE" as "ONLINE" | "OFFLINE" | "STANDBY",
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOptions = async () => {
    try {
      const res = await authedFetch("/management/devices/options");
      if (res.ok) {
        const data = await res.json();
        setOptions(data);
      }
    } catch {
      // Non-blocking fallback
    }
  };

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/management/devices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load device mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchDevices();
    fetchOptions();
  }, [authLoading]);

  // Open modal for Add
  const handleOpenAdd = () => {
    setEditingDevice(null);
    setFormData({
      name: "",
      deviceCode: `DEV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      deviceType: "POS_TERMINAL",
      ipAddress: "192.168.1.100",
      port: 9100,
      macAddress: "",
      stationId: options?.stations[0]?.id || "",
      areaId: options?.areas[0]?.id || "",
      printerIp: options?.stations[0]?.printerIp || "192.168.1.200",
      printerPort: 9100,
      paperWidth: options?.defaultPrintSettings?.paperWidthMm || 80,
      assignedUserId: options?.users[0]?.id || "",
      autoPrintKot: options?.defaultPrintSettings?.autoPrintKot ?? true,
      autoPrintBill: options?.defaultPrintSettings?.autoPrintBill ?? true,
      soundAlerts: true,
      allowCash: true,
      allowDiscount: true,
      isActive: true,
      status: "ONLINE",
    });
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (dev: DeviceMappingItem) => {
    setEditingDevice(dev);
    setFormData({
      name: dev.name,
      deviceCode: dev.deviceCode,
      deviceType: dev.deviceType,
      ipAddress: dev.ipAddress || "",
      port: dev.port || 9100,
      macAddress: dev.macAddress || "",
      stationId: dev.stationId || "",
      areaId: dev.areaId || "",
      printerIp: dev.printerIp || "",
      printerPort: dev.printerPort || 9100,
      paperWidth: dev.paperWidth || 80,
      assignedUserId: dev.assignedUserId || "",
      autoPrintKot: dev.capabilities?.autoPrintKot ?? true,
      autoPrintBill: dev.capabilities?.autoPrintBill ?? true,
      soundAlerts: dev.capabilities?.soundAlerts ?? true,
      allowCash: dev.capabilities?.allowCash ?? true,
      allowDiscount: dev.capabilities?.allowDiscount ?? true,
      isActive: dev.isActive,
      status: dev.status,
    });
    setIsModalOpen(true);
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast("Device name is required", "error");
      return;
    }

    setIsSaving(true);
    try {
      const selectedStation = options?.stations.find((s) => s.id === formData.stationId);
      const selectedArea = options?.areas.find((a) => a.id === formData.areaId);
      const selectedUser = options?.users.find((u) => u.id === formData.assignedUserId);

      const payload = {
        name: formData.name.trim(),
        deviceCode: formData.deviceCode.trim() || undefined,
        deviceType: formData.deviceType,
        ipAddress: formData.ipAddress.trim() || null,
        port: Number(formData.port) || 9100,
        macAddress: formData.macAddress.trim() || null,
        stationId: formData.stationId || null,
        stationName: selectedStation?.name || null,
        areaId: formData.areaId || null,
        areaName: selectedArea?.name || null,
        printerIp: formData.printerIp.trim() || null,
        printerPort: Number(formData.printerPort) || 9100,
        paperWidth: Number(formData.paperWidth) || 80,
        assignedUserId: formData.assignedUserId || null,
        assignedUserName: selectedUser?.name || null,
        capabilities: {
          autoPrintKot: formData.autoPrintKot,
          autoPrintBill: formData.autoPrintBill,
          soundAlerts: formData.soundAlerts,
          allowCash: formData.allowCash,
          allowDiscount: formData.allowDiscount,
        },
        isActive: formData.isActive,
        status: formData.status,
      };

      const url = editingDevice
        ? `/management/devices/${editingDevice.id}`
        : "/management/devices";
      const method = editingDevice ? "PUT" : "POST";

      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }

      showToast(
        editingDevice ? `Updated device ${formData.name}` : `Registered ${formData.name}`,
        "success"
      );
      setIsModalOpen(false);
      fetchDevices();
    } catch (err: any) {
      showToast(err.message || "Failed to save device", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove device "${name}"?`)) return;
    setBusyDeviceId(id);
    try {
      const res = await authedFetch(`/management/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast(`Removed device ${name}`, "info");
      fetchDevices();
    } catch (err: any) {
      showToast(err.message || "Failed to delete device", "error");
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handlePingDevice = async (dev: DeviceMappingItem) => {
    setBusyDeviceId(dev.id);
    try {
      const res = await authedFetch(`/management/devices/${dev.id}/ping`, { method: "POST" });
      if (!res.ok) throw new Error("Ping failed");
      const result = await res.json();
      showToast(`⚡ ${dev.name} is ONLINE (${result.latencyMs || 12}ms latency)`, "success");
      fetchDevices();
    } catch (err: any) {
      showToast(`❌ Could not reach ${dev.name} (${dev.ipAddress || "no IP"})`, "error");
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleTestPrint = async (dev: DeviceMappingItem) => {
    setBusyDeviceId(dev.id);
    try {
      const res = await authedFetch(`/management/devices/${dev.id}/test-print`, { method: "POST" });
      if (!res.ok) throw new Error("Print failed");
      const result = await res.json();
      showToast(`🖨️ ${result.message || "Test ticket sent"}`, "success");
    } catch (err: any) {
      showToast(`❌ Printer test failed for ${dev.name}`, "error");
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handlePingAll = async () => {
    showToast("Pinging all registered devices across network...", "info");
    for (const d of devices) {
      await authedFetch(`/management/devices/${d.id}/ping`, { method: "POST" }).catch(() => null);
    }
    fetchDevices();
    showToast("All devices refreshed and synced!", "success");
  };

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // Tab filter
      if (activeTab !== "ALL") {
        if (activeTab === "WAITER_TABLET") {
          if (d.deviceType !== "WAITER_TABLET" && d.deviceType !== "CAPTAIN_DEVICE") return false;
        } else if (activeTab === "KOT_PRINTER") {
          if (d.deviceType !== "KOT_PRINTER" && d.deviceType !== "BILL_PRINTER") return false;
        } else if (d.deviceType !== activeTab) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "ALL" && d.status !== statusFilter) {
        return false;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          d.name.toLowerCase().includes(q) ||
          d.deviceCode.toLowerCase().includes(q) ||
          (d.ipAddress && d.ipAddress.toLowerCase().includes(q)) ||
          (d.stationName && d.stationName.toLowerCase().includes(q)) ||
          (d.areaName && d.areaName.toLowerCase().includes(q)) ||
          (d.assignedUserName && d.assignedUserName.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [devices, activeTab, statusFilter, searchQuery]);

  // Quick stats
  const stats = useMemo(() => {
    return {
      total: devices.length,
      online: devices.filter((d) => d.status === "ONLINE").length,
      pos: devices.filter((d) => d.deviceType === "POS_TERMINAL").length,
      kds: devices.filter((d) => d.deviceType === "KDS_DISPLAY").length,
      printers: devices.filter((d) => d.deviceType === "KOT_PRINTER" || d.deviceType === "BILL_PRINTER").length,
    };
  }, [devices]);

  if (authLoading) return null;

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Device Mapping & Hardware Terminals</title>
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            {/* Header row */}
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / Device Mapping
                </span>
                <h1 className="greeting-title">Device Mapping & Hardware Terminals</h1>
                <p className="greeting-subtitle">
                  Configure POS terminals, KDS kitchen screens, handheld waiter tablets, and thermal ESC/POS network printers.
                </p>
              </div>

              <div className="header-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handlePingAll}
                  disabled={loading || devices.length === 0}
                >
                  <span>⚡</span> Ping All Devices
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={fetchDevices}
                  disabled={loading}
                >
                  <span>↻</span> Refresh
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleOpenAdd}
                >
                  <span>+</span> Register Device
                </button>
              </div>
            </section>

            {/* Metrics KPI Bar */}
            <section className="stats-kpi-grid">
              <div className="stat-card">
                <span className="stat-label">Total Devices</span>
                <div className="stat-num-row">
                  <span className="stat-value">{stats.total}</span>
                  <span className="stat-pill neutral">Configured</span>
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-label">Online Status</span>
                <div className="stat-num-row">
                  <span className="stat-value text-emerald">{stats.online}</span>
                  <span className="stat-pill online">Healthy</span>
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-label">Kitchen KDS Displays</span>
                <div className="stat-num-row">
                  <span className="stat-value">{stats.kds}</span>
                  <span className="stat-pill accent">Live Stations</span>
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-label">POS Billing Terminals</span>
                <div className="stat-num-row">
                  <span className="stat-value">{stats.pos}</span>
                  <span className="stat-pill info">Cashier Desks</span>
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-label">Network Printers</span>
                <div className="stat-num-row">
                  <span className="stat-value">{stats.printers}</span>
                  <span className="stat-pill warning">ESC/POS</span>
                </div>
              </div>
            </section>

            {/* Controls Bar (Filter Tabs + Search + Status Dropdown) */}
            <section className="controls-panel">
              <div className="tabs-container">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`filter-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="search-filter-group">
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by device, code, IP, station, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button type="button" className="btn-clear" onClick={() => setSearchQuery("")}>
                      ✕
                    </button>
                  )}
                </div>

                <select
                  className="select-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ONLINE">Online Only</option>
                  <option value="OFFLINE">Offline Only</option>
                  <option value="STANDBY">Standby</option>
                </select>
              </div>
            </section>

            {/* Main Cards Matrix */}
            {loading ? (
              <div className="loading-card">
                <div className="spinner" />
                <p>Loading device mappings...</p>
              </div>
            ) : error ? (
              <div className="error-card">
                <span className="error-icon">⚠️</span>
                <p>{error}</p>
                <button type="button" className="btn-secondary" onClick={fetchDevices}>
                  Try Again
                </button>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="empty-state-box">
                <span className="empty-icon">📟</span>
                <h3>No Devices Found</h3>
                <p>
                  {searchQuery || activeTab !== "ALL" || statusFilter !== "ALL"
                    ? "No device mapping matches your active filter criteria."
                    : "No hardware terminals or printers have been registered yet."}
                </p>
                <button type="button" className="btn-primary" onClick={handleOpenAdd}>
                  + Register First Device
                </button>
              </div>
            ) : (
              <div className="devices-grid">
                {filteredDevices.map((dev) => {
                  const isBusy = busyDeviceId === dev.id;
                  const isOnline = dev.status === "ONLINE";
                  const icon = DEVICE_TYPE_ICONS[dev.deviceType] || "📟";
                  const typeLabel = DEVICE_TYPE_LABELS[dev.deviceType] || dev.deviceType;

                  return (
                    <div key={dev.id} className={`device-card ${!dev.isActive ? "inactive" : ""}`}>
                      {/* Top bar */}
                      <div className="device-card-header">
                        <div className="type-badge">
                          <span className="type-icon">{icon}</span>
                          <span className="type-name">{typeLabel}</span>
                        </div>

                        <div className="status-indicator-box">
                          <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                          <span className="status-text">{dev.status}</span>
                          <span className="latency-text">{dev.latencyMs}ms</span>
                        </div>
                      </div>

                      {/* Title & Code */}
                      <div className="device-title-box">
                        <h3 className="device-name">{dev.name}</h3>
                        <span className="device-code">{dev.deviceCode}</span>
                      </div>

                      {/* Specs / Mapping List */}
                      <div className="device-meta-list">
                        <div className="meta-row">
                          <span className="meta-key">Mapped Station:</span>
                          <span className="meta-val highlight">
                            {dev.stationName ? `🍳 ${dev.stationName}` : "— Global / None"}
                          </span>
                        </div>

                        <div className="meta-row">
                          <span className="meta-key">Dining Area / Section:</span>
                          <span className="meta-val">
                            {dev.areaName ? `🍽️ ${dev.areaName}` : "— All Areas"}
                          </span>
                        </div>

                        <div className="meta-row">
                          <span className="meta-key">Network IP / Port:</span>
                          <span className="meta-val code">
                            {dev.ipAddress ? `🌐 ${dev.ipAddress}:${dev.port}` : "— Dynamic / DHCP"}
                          </span>
                        </div>

                        <div className="meta-row">
                          <span className="meta-key">Printer Gateway:</span>
                          <span className="meta-val">
                            {dev.printerIp ? `🖨️ ${dev.printerIp} (${dev.paperWidth}mm)` : "— System Default"}
                          </span>
                        </div>

                        <div className="meta-row">
                          <span className="meta-key">Assigned Operator:</span>
                          <span className="meta-val">
                            {dev.assignedUserName ? `👤 ${dev.assignedUserName}` : "— Unassigned"}
                          </span>
                        </div>
                      </div>

                      {/* Capabilities Chips */}
                      <div className="caps-row">
                        {dev.capabilities?.autoPrintKot && <span className="cap-pill">Auto-KOT</span>}
                        {dev.capabilities?.autoPrintBill && <span className="cap-pill">Auto-Bill</span>}
                        {dev.capabilities?.soundAlerts && <span className="cap-pill">Chime</span>}
                        {dev.capabilities?.allowCash && <span className="cap-pill">Cash Draw</span>}
                      </div>

                      {/* Actions */}
                      <div className="device-actions-row">
                        <button
                          type="button"
                          className="btn-action ping"
                          onClick={() => handlePingDevice(dev)}
                          disabled={isBusy}
                          title="Ping device & test latency"
                        >
                          ⚡ Ping
                        </button>

                        <button
                          type="button"
                          className="btn-action print"
                          onClick={() => handleTestPrint(dev)}
                          disabled={isBusy}
                          title="Print test receipt/KOT"
                        >
                          🖨️ Print Test
                        </button>

                        <button
                          type="button"
                          className="btn-action edit"
                          onClick={() => handleOpenEdit(dev)}
                          disabled={isBusy}
                          title="Edit device configuration"
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          className="btn-action delete"
                          onClick={() => handleDeleteDevice(dev.id, dev.name)}
                          disabled={isBusy}
                          title="Remove device"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2>{editingDevice ? "Edit Device Mapping" : "Register Hardware Device"}</h2>
              <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="modal-form">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Device Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Counter 1 POS, Main Kitchen KDS"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Device Code / Identifier *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DEV-POS-01, KDS-02"
                    value={formData.deviceCode}
                    onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Device Type *</label>
                  <select
                    value={formData.deviceType}
                    onChange={(e) => setFormData({ ...formData, deviceType: e.target.value as any })}
                  >
                    {options?.deviceTypes?.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.icon} {dt.label}
                      </option>
                    )) || (
                      <>
                        <option value="POS_TERMINAL">💻 Billing POS Terminal</option>
                        <option value="KDS_DISPLAY">🍳 Kitchen Display System (KDS)</option>
                        <option value="WAITER_TABLET">📱 Waiter / Captain Tablet</option>
                        <option value="KOT_PRINTER">🖨️ Thermal KOT Printer</option>
                        <option value="BILL_PRINTER">🧾 Receipt Printer</option>
                        <option value="CUSTOMER_DISPLAY">🖥️ Customer Facing Display</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="ONLINE">🟢 Online (Active)</option>
                    <option value="STANDBY">🟡 Standby (Idle)</option>
                    <option value="OFFLINE">⚪ Offline</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Mapped Kitchen Station</label>
                  <select
                    value={formData.stationId}
                    onChange={(e) => setFormData({ ...formData, stationId: e.target.value })}
                  >
                    <option value="">— None / All Stations —</option>
                    {options?.stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        🍳 {s.name} {s.printerIp ? `(Printer: ${s.printerIp})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Mapped Dining Area / Section</label>
                  <select
                    value={formData.areaId}
                    onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                  >
                    <option value="">— None / All Areas —</option>
                    {options?.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        🍽️ {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label>Device IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.101"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Network Port</label>
                  <input
                    type="number"
                    placeholder="9100"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>MAC Address</label>
                  <input
                    type="text"
                    placeholder="00:1A:2B:3C:4D:5E"
                    value={formData.macAddress}
                    onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                  />
                </div>
              </div>

              {/* Printer Details */}
              <div className="section-divider">Printer Configuration</div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label>Printer IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.200"
                    value={formData.printerIp}
                    onChange={(e) => setFormData({ ...formData, printerIp: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Printer Port</label>
                  <input
                    type="number"
                    placeholder="9100"
                    value={formData.printerPort}
                    onChange={(e) => setFormData({ ...formData, printerPort: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Paper Width</label>
                  <select
                    value={formData.paperWidth}
                    onChange={(e) => setFormData({ ...formData, paperWidth: Number(e.target.value) })}
                  >
                    <option value={80}>80mm (Standard 3-inch)</option>
                    <option value={58}>58mm (Small 2-inch)</option>
                  </select>
                </div>
              </div>

              {/* Staff and Capabilities */}
              <div className="section-divider">Staff & Capabilities</div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Assigned Staff Member</label>
                  <select
                    value={formData.assignedUserId}
                    onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                  >
                    <option value="">— Unassigned (Shared Device) —</option>
                    {options?.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        👤 {u.name} {u.userCode ? `(PIN Code: ${u.userCode})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-checkbox-group">
                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.autoPrintKot}
                      onChange={(e) => setFormData({ ...formData, autoPrintKot: e.target.checked })}
                    />
                    <span>Auto-Print KOT on Order Place</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.autoPrintBill}
                      onChange={(e) => setFormData({ ...formData, autoPrintBill: e.target.checked })}
                    />
                    <span>Auto-Print Receipt on Settlement</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.soundAlerts}
                      onChange={(e) => setFormData({ ...formData, soundAlerts: e.target.checked })}
                    />
                    <span>Sound / Chime Alerts</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving..." : editingDevice ? "Save Changes" : "Register Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-popup ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}

      <style jsx global>{`
        .mg-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background-color: #0b0f19;
          color: #f8fafc;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1440px;
          margin: 0 auto;
          width: 100%;
        }
        .dashboard-greeting-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .breadcrumb-line {
          font-size: 0.75rem;
          color: #94a3b8;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .breadcrumb-line a {
          color: #94a3b8;
          text-decoration: underline;
        }
        .greeting-title {
          margin: 4px 0 4px 0;
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: #ffffff;
        }
        .greeting-subtitle {
          margin: 0;
          font-size: 0.875rem;
          color: #94a3b8;
          max-width: 650px;
        }
        .header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn-primary {
          background: linear-gradient(135deg, #e11d48, #be123c);
          color: #ffffff;
          border: none;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
          box-shadow: 0 2px 10px rgba(225, 29, 72, 0.25);
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #f43f5e, #e11d48);
          transform: translateY(-1px);
        }
        .btn-secondary {
          background: rgba(30, 41, 59, 0.8);
          color: #e2e8f0;
          border: 1px solid #334155;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .btn-secondary:hover {
          background: #334155;
          color: #ffffff;
        }

        /* Stats KPI Bar */
        .stats-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        .stat-card {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 16px 20px;
          backdrop-filter: blur(10px);
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .stat-num-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-top: 8px;
        }
        .stat-value {
          font-size: 1.875rem;
          font-weight: 800;
          color: #f8fafc;
        }
        .text-emerald {
          color: #10b981;
        }
        .stat-pill {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 9999px;
        }
        .stat-pill.neutral {
          background: #1e293b;
          color: #cbd5e1;
        }
        .stat-pill.online {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
        }
        .stat-pill.accent {
          background: rgba(225, 29, 72, 0.15);
          color: #fb7185;
        }
        .stat-pill.info {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
        }
        .stat-pill.warning {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
        }

        /* Controls Panel */
        .controls-panel {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 10px 16px;
        }
        .tabs-container {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .filter-tab {
          background: transparent;
          color: #94a3b8;
          border: none;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .filter-tab:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.04);
        }
        .filter-tab.active {
          background: #e11d48;
          color: #ffffff;
        }
        .search-filter-group {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-box input {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 8px 30px 8px 32px;
          font-size: 0.8125rem;
          color: #f8fafc;
          width: 280px;
        }
        .search-box input:focus {
          outline: none;
          border-color: #e11d48;
        }
        .search-icon {
          position: absolute;
          left: 10px;
          font-size: 0.8125rem;
          color: #64748b;
        }
        .btn-clear {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
        }
        .select-status {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 0.8125rem;
          color: #f8fafc;
        }

        /* Devices Grid */
        .devices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }
        .device-card {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid #1e293b;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .device-card:hover {
          transform: translateY(-2px);
          border-color: #334155;
        }
        .device-card.inactive {
          opacity: 0.6;
        }
        .device-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .type-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid #334155;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #cbd5e1;
        }
        .status-indicator-box {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.online {
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
        }
        .status-dot.offline {
          background: #64748b;
        }
        .status-text {
          color: #e2e8f0;
        }
        .latency-text {
          color: #64748b;
          font-size: 0.7rem;
        }

        .device-title-box {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }
        .device-name {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #f8fafc;
        }
        .device-code {
          font-family: monospace;
          font-size: 0.75rem;
          color: #94a3b8;
          background: rgba(30, 41, 59, 0.8);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .device-meta-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
          font-size: 0.8125rem;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .meta-key {
          color: #64748b;
        }
        .meta-val {
          color: #cbd5e1;
          font-weight: 500;
          text-align: right;
        }
        .meta-val.highlight {
          color: #fb7185;
          font-weight: 600;
        }
        .meta-val.code {
          font-family: monospace;
          font-size: 0.75rem;
        }

        .caps-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding-top: 4px;
        }
        .cap-pill {
          font-size: 0.6875rem;
          font-weight: 600;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid #334155;
          padding: 2px 8px;
          border-radius: 9999px;
          color: #94a3b8;
        }

        .device-actions-row {
          display: flex;
          gap: 8px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid #1e293b;
        }
        .btn-action {
          flex: 1;
          background: #1e293b;
          border: 1px solid #334155;
          color: #cbd5e1;
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-action:hover {
          background: #334155;
          color: #ffffff;
        }
        .btn-action.ping:hover {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border-color: #10b981;
        }
        .btn-action.print:hover {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border-color: #3b82f6;
        }
        .btn-action.delete {
          flex: 0 0 36px;
          color: #ef4444;
        }
        .btn-action.delete:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }

        /* Modal Styles */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }
        .modal-card {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 16px;
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 24px 28px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 14px;
          margin-bottom: 20px;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 800;
          color: #ffffff;
        }
        .btn-close {
          background: none;
          border: none;
          font-size: 1.125rem;
          color: #94a3b8;
          cursor: pointer;
        }
        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
        }
        .form-group input,
        .form-group select {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 0.8125rem;
          color: #f8fafc;
        }
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #e11d48;
        }
        .section-divider {
          font-size: 0.75rem;
          font-weight: 700;
          color: #e2e8f0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding-top: 10px;
          border-top: 1px solid #1e293b;
        }
        .form-checkbox-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          justify-content: center;
        }
        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
          color: #cbd5e1;
          cursor: pointer;
        }
        .checkbox-item input {
          accent-color: #e11d48;
          cursor: pointer;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid #1e293b;
          padding-top: 16px;
          margin-top: 8px;
        }

        /* Loading / Empty States */
        .loading-card,
        .error-card,
        .empty-state-box {
          background: #0f172a;
          border: 1px dashed #334155;
          border-radius: 12px;
          padding: 60px 20px;
          text-align: center;
        }
        .empty-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 12px;
        }
        .empty-state-box h3 {
          margin: 0 0 6px 0;
          font-size: 1.125rem;
          font-weight: 700;
        }
        .empty-state-box p {
          margin: 0 0 16px 0;
          font-size: 0.8125rem;
          color: #94a3b8;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #334155;
          border-top-color: #e11d48;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 12px auto;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Toast Popup */
        .toast-popup {
          position: fixed;
          bottom: 28px;
          right: 28px;
          padding: 12px 20px;
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 600;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          z-index: 10000;
          animation: slideUp 0.25s ease-out;
        }
        .toast-popup.success {
          background: #10b981;
          color: #ffffff;
        }
        .toast-popup.error {
          background: #ef4444;
          color: #ffffff;
        }
        .toast-popup.info {
          background: #3b82f6;
          color: #ffffff;
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

