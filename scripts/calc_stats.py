import json

# Comprehensive evaluation data for all 90 screens
evaluation = [
    # 01: Cashier
    (1, "01_Cashier_POS_Operator", "Floor_Plan_Table_Status", "DONE", "Implemented in TableViewFloor.tsx & waiter.tsx"),
    (2, "01_Cashier_POS_Operator", "Floor_Plan_Actions_MoveKOT", "DONE", "Implemented in TableViewFloor.tsx & MoveKotModal.tsx"),
    (3, "01_Cashier_POS_Operator", "Order_Entry_Menu_Grid", "DONE", "Implemented in PosBillingView.tsx & CategoryNavbar.tsx"),
    (4, "01_Cashier_POS_Operator", "Order_Entry_Item_Selection", "DONE", "Implemented in PosBillingView.tsx & AttractiveMenuItemCard.tsx"),
    (5, "01_Cashier_POS_Operator", "Order_Entry_Cart_Summary", "DONE", "Implemented in PosBillingView.tsx"),
    (6, "01_Cashier_POS_Operator", "Order_Entry_Search_Modifiers", "DONE", "Implemented in MenuCustomizerModal.tsx"),
    (7, "01_Cashier_POS_Operator", "Order_Entry_Comments_Instructions", "PARTIAL", "Basic item notes exist, but missing dedicated order comments popover"),
    (8, "01_Cashier_POS_Operator", "Order_Entry_Checkout_Actions", "DONE", "Implemented in PosBillingView.tsx & BillSplitModal.tsx"),
    (26, "01_Cashier_POS_Operator", "Pickup_Order_Settlement", "PARTIAL", "Dine-in/Takeaway checkout exists, but missing dedicated Pickup quick-settle view"),
    (29, "01_Cashier_POS_Operator", "Pending_Advance_Orders_Modal", "PARTIAL", "Hold drawer exists, but missing Advance Order date-time booking modal"),
    (30, "01_Cashier_POS_Operator", "Delivery_Container_Charges_Modal", "MISSING", "Delivery/Container packaging charge auto-calc modal missing"),
    (38, "01_Cashier_POS_Operator", "Current_Orders_Register", "DONE", "Implemented in pages/orders.tsx"),

    # 02: Captain
    (1, "02_Captain_Waiter_OrderTaking", "Floor_Plan_Table_Status", "DONE", "Implemented in waiter.tsx & TableViewFloor.tsx"),
    (2, "02_Captain_Waiter_OrderTaking", "Table_Transfer_Move_KOT", "DONE", "Implemented in MoveKotModal.tsx"),
    (3, "02_Captain_Waiter_OrderTaking", "Table_Order_Menu_Browsing", "DONE", "Implemented in waiter.tsx & [tableId].tsx"),
    (4, "02_Captain_Waiter_OrderTaking", "Item_Selection_Punching", "DONE", "Implemented in PosBillingView.tsx & waiter.tsx"),
    (5, "02_Captain_Waiter_OrderTaking", "Table_Cart_KOT_Preview", "DONE", "Implemented in PosBillingView.tsx (Send KOT)"),
    (7, "02_Captain_Waiter_OrderTaking", "Special_Instructions_Cooking_Notes", "PARTIAL", "Item notes exist, but missing special instructions drawer"),
    (63, "02_Captain_Waiter_OrderTaking", "Special_Notes_Presets", "MISSING", "Special notes quick-chips (Less Masala, Spicy, Jain) missing"),
    (65, "02_Captain_Waiter_OrderTaking", "Table_Layout_Reference", "DONE", "Implemented in table-management.tsx"),

    # 03: Kitchen
    (18, "03_Kitchen_Chef_KDS", "KOT_Live_Feed_Tickets", "DONE", "Implemented in pages/kitchen.tsx"),
    (20, "03_Kitchen_Chef_KDS", "KOT_Preparation_Progress", "DONE", "Implemented in pages/kitchen.tsx"),
    (24, "03_Kitchen_Chef_KDS", "KOT_Detailed_Item_Listing", "DONE", "Implemented in pages/kitchen.tsx"),
    (25, "03_Kitchen_Chef_KDS", "KOT_DineIn_Table_Tickets", "DONE", "Implemented in pages/kitchen.tsx"),
    (39, "03_Kitchen_Chef_KDS", "KOT_Listing_Timer_Audit", "PARTIAL", "Kitchen analytics exists, but dedicated KOT history timer audit table missing"),
    (76, "03_Kitchen_Chef_KDS", "Preparation_Time_Defaults", "MISSING", "Preparation time defaults & billing image settings screen missing"),
    (77, "03_Kitchen_Chef_KDS", "KOT_Online_Advance_Print_Rules", "MISSING", "Online advance order KOT auto-print config missing"),

    # 04: Online Delivery
    (16, "04_Online_Delivery_Manager", "Online_Orders_OTP_Verification", "PARTIAL", "Aggregator orders view exists, but OTP verification field missing"),
    (17, "04_Online_Delivery_Manager", "Rider_Status_Call_Customer", "PARTIAL", "Rider info exists, but 'Looking for rider'/'ARRIVED' status & Call Customer missing"),
    (19, "04_Online_Delivery_Manager", "Dispatch_Channel_Filter", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (21, "04_Online_Delivery_Manager", "DineIn_vs_Delivery_Dispatch", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (22, "04_Online_Delivery_Manager", "Aggregator_Live_Feed_Overview", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (23, "04_Online_Delivery_Manager", "Aggregator_Feed_Detail_Timers", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (27, "04_Online_Delivery_Manager", "Online_Orders_Status_Board", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (28, "04_Online_Delivery_Manager", "Food_Ready_SLA_Delay_Alerts", "PARTIAL", "SLA timers exist, but dedicated Food Ready In Time / Delayed alert banner missing"),
    (31, "04_Online_Delivery_Manager", "Delivery_Dispatch_Board", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (32, "04_Online_Delivery_Manager", "Delivery_Status_Filters", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (33, "04_Online_Delivery_Manager", "Zomato_Live_Order_Coordination", "PARTIAL", "Zomato card exists, but rider chat/call help missing"),
    (34, "04_Online_Delivery_Manager", "Unified_Aggregator_Feed", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (35, "04_Online_Delivery_Manager", "Active_Delivery_Queue_Monitor", "DONE", "Implemented in AggregatorOrdersView.tsx"),
    (73, "04_Online_Delivery_Manager", "Store_Online_Status_Master_Switch", "DONE", "Implemented in pages/channel-availability.tsx"),

    # 05: Store / Inventory
    (9, "05_Store_Inventory_Manager", "Item_Availability_Master_Toggle", "DONE", "Implemented in channel-availability.tsx & ItemToggleModal.tsx"),
    (10, "05_Store_Inventory_Manager", "Category_Item_Availability", "DONE", "Implemented in channel-availability.tsx"),
    (11, "05_Store_Inventory_Manager", "Swiggy_Channel_Availability", "DONE", "Implemented in channel-availability.tsx"),
    (12, "05_Store_Inventory_Manager", "Online_Display_Name_Config", "MISSING", "Online display name configuration missing in catalog"),
    (13, "05_Store_Inventory_Manager", "Home_Delivery_Catalog_Toggle", "DONE", "Implemented in channel-availability.tsx"),
    (14, "05_Store_Inventory_Manager", "Menu_Availability_Sync", "DONE", "Implemented in channel-availability.tsx"),
    (15, "05_Store_Inventory_Manager", "MultiChannel_Availability_Sync", "DONE", "Implemented in channel-availability.tsx"),
    (62, "05_Store_Inventory_Manager", "Offline_Only_Billing_Filter", "MISSING", "Available for offline billing only toggle missing"),
    (70, "05_Store_Inventory_Manager", "Inventory_Purchase_Wastage_Hub", "DONE", "Implemented in pages/inventory.tsx"),

    # 06: Restaurant Manager
    (36, "06_Restaurant_Manager_Admin", "Operations_Hub_Billing_Nav", "PARTIAL", "Admin page & header exist, but legacy operations navigation tile view missing"),
    (37, "06_Restaurant_Manager_Admin", "Operations_Hub_CashFlow_Menu", "PARTIAL", "Admin dashboard exists, but Cash Flow / Customer operations menu missing"),
    (58, "06_Restaurant_Manager_Admin", "Custom_Order_Status_Config", "MISSING", "Custom Order Status configuration screen missing"),
    (60, "06_Restaurant_Manager_Admin", "Menu_Configuration_Dashboard", "DONE", "Implemented in pages/menu.tsx"),
    (61, "06_Restaurant_Manager_Admin", "Menu_Item_Master_275Items", "DONE", "Implemented in pages/menu.tsx"),
    (63, "06_Restaurant_Manager_Admin", "Special_Notes_Master", "MISSING", "Special Notes Master CRUD screen missing"),
    (64, "06_Restaurant_Manager_Admin", "Area_Management_6Areas", "DONE", "Implemented in pages/table-management.tsx"),
    (65, "06_Restaurant_Manager_Admin", "Table_Master_45Tables", "DONE", "Implemented in pages/table-management.tsx & AddTableModal.tsx"),
    (67, "06_Restaurant_Manager_Admin", "Customer_Database_CRM", "DONE", "Implemented in pages/crm.tsx"),
    (68, "06_Restaurant_Manager_Admin", "Customer_Feedback_Complaints", "MISSING", "Customer Feedback & Complaints audit screen missing"),
    (71, "06_Restaurant_Manager_Admin", "Operations_Master_Hub", "DONE", "Implemented in pages/admin.tsx"),
    (72, "06_Restaurant_Manager_Admin", "Staff_Biller_Profiles_Master", "DONE", "Implemented in pages/user-management.tsx"),

    # 07: Finance
    (66, "07_Accountant_Auditor_Finance", "Tax_Master_GST_Setup", "MISSING", "Backward tax (Dine-in) vs Forward tax (Online) Tax Master missing"),
    (84, "07_Accountant_Auditor_Finance", "Reports_BI_Analytics_Hub", "DONE", "Implemented in pages/finance.tsx & admin.tsx"),
    (85, "07_Accountant_Auditor_Finance", "Category_Sales_Report", "PARTIAL", "Reporting exists in admin, but dedicated Category Report with Excel export missing"),
    (86, "07_Accountant_Auditor_Finance", "Item_Sales_Report", "PARTIAL", "Item performance exists, but dedicated SKU Item Report with export missing"),
    (87, "07_Accountant_Auditor_Finance", "Order_Sales_Audit_Ledger", "PARTIAL", "Orders list exists, but dedicated audit ledger with payment breakdowns missing"),
    (88, "07_Accountant_Auditor_Finance", "Executive_Sales_Summary", "DONE", "Implemented in pages/admin.tsx & finance.tsx (Z-Report)"),
    (89, "07_Accountant_Auditor_Finance", "DayEnd_Settlement_Swiggy_Summary", "PARTIAL", "Payment breakdown exists, but Swiggy/Zomato channel reconciliation missing"),
    (90, "07_Accountant_Auditor_Finance", "Payment_Reconciliation_Returns", "MISSING", "Complimentary Orders & Sales Return reconciliation ledger missing"),

    # 08: IT Admin (28 screens)
    (40, "08_System_IT_Hardware_Admin", "Billing_Config_Defaults", "MISSING", "Billing Screen Defaults configuration missing"),
    (41, "08_System_IT_Hardware_Admin", "Billing_Config_Charges_Calc", "MISSING", "Delivery & Container charges calculation rules missing"),
    (42, "08_System_IT_Hardware_Admin", "Billing_Config_Phone_Validation", "MISSING", "Customer phone validation & item merge rules missing"),
    (43, "08_System_IT_Hardware_Admin", "Billing_Config_Table_Rules", "MISSING", "Item sorting A-Z, discount defaults, table lock rules missing"),
    (44, "08_System_IT_Hardware_Admin", "Billing_Config_Stock_Focus", "MISSING", "Out of stock actions & keyboard focus settings missing"),
    (45, "08_System_IT_Hardware_Admin", "Billing_Config_KOT_Display", "MISSING", "KOT display preferences missing"),
    (46, "08_System_IT_Hardware_Admin", "Billing_Config_Tips_Loyalty", "PARTIAL", "Tips calculator exists, but global tips configuration missing"),
    (47, "08_System_IT_Hardware_Admin", "Print_Configuration_Overview", "MISSING", "Print Configuration overview screen missing"),
    (48, "08_System_IT_Hardware_Admin", "Printer_Listing_Device_Manager", "MISSING", "Printer Listing / Device Manager missing"),
    (49, "08_System_IT_Hardware_Admin", "Add_Printer_Port_Setup", "MISSING", "Add Printer & Port/Driver setup dialog missing"),
    (50, "08_System_IT_Hardware_Admin", "Print_Layout_Header_WelcomeMsg", "MISSING", "Print Layout: Header text & welcome message config missing"),
    (51, "08_System_IT_Hardware_Admin", "Print_Layout_Notes_TaxBreakdown", "MISSING", "Print Layout: Tax breakdown & notes toggles missing"),
    (52, "08_System_IT_Hardware_Admin", "Print_Layout_Due_Typography", "MISSING", "Print Layout: Due amount & font sizes missing"),
    (53, "08_System_IT_Hardware_Admin", "Print_Layout_ColumnWidths_Rows", "MISSING", "Print Layout: Column widths & row heights missing"),
    (54, "08_System_IT_Hardware_Admin", "Print_Layout_Backward_Tax", "MISSING", "Print Layout: Backward tax formatting toggle missing"),
    (55, "08_System_IT_Hardware_Admin", "Print_Layout_SpecialNotes_OnlineStatus", "MISSING", "Print Layout: Special notes typography & online status missing"),
    (56, "08_System_IT_Hardware_Admin", "Print_Layout_KOT_Modification_Rules", "MISSING", "Print Layout: Modified KOT print & deleted item rules missing"),
    (57, "08_System_IT_Hardware_Admin", "Print_Layout_Barcodes_ErrorAlerts", "MISSING", "Print Layout: Barcode printing & printer error alerts missing"),
    (59, "08_System_IT_Hardware_Admin", "Advanced_Search_System_Shortcuts", "DONE", "Implemented in QuickSearchModal.tsx"),
    (69, "08_System_IT_Hardware_Admin", "Customer_Display_Pole_LED_VFD", "MISSING", "Customer Display Pole (LED/VFD COM Port) setup missing"),
    (74, "08_System_IT_Hardware_Admin", "Restaurant_System_Config_Hub", "MISSING", "Restaurant System Configuration tile hub missing"),
    (75, "08_System_IT_Hardware_Admin", "System_Timers_Sync_Rates", "MISSING", "Pending order & captain sync interval timers missing"),
    (78, "08_System_IT_Hardware_Admin", "System_Maintenance_Hub", "MISSING", "System Maintenance Hub (Reset sync code, DB tools) missing"),
    (79, "08_System_IT_Hardware_Admin", "Database_Migration_Utility", "MISSING", "Database Migration runner UI missing"),
    (80, "08_System_IT_Hardware_Admin", "Data_Purge_Orders_KOTs", "MISSING", "Order & KOT test data purge utility missing"),
    (81, "08_System_IT_Hardware_Admin", "Backup_Files_Cleanup", "MISSING", "Local backup files cleanup utility missing"),
    (82, "08_System_IT_Hardware_Admin", "System_Connectivity_Logs", "MISSING", "Internet & server connectivity logs viewer missing"),
    (83, "08_System_IT_Hardware_Admin", "LAN_Architecture_Machines_IPs", "PARTIAL", "LAN discovery exists, but Main Server IP vs Client Machine IP config missing")
]

# Calculate totals
roles_stats = {}
for item in evaluation:
    num, role, title, status, notes = item
    if role not in roles_stats:
        roles_stats[role] = {"DONE": 0, "PARTIAL": 0, "MISSING": 0, "TOTAL": 0}
    roles_stats[role][status] += 1
    roles_stats[role]["TOTAL"] += 1

print("--- ROLE WISE STATUS STATS ---")
tot_done = sum(s["DONE"] for s in roles_stats.values())
tot_part = sum(s["PARTIAL"] for s in roles_stats.values())
tot_miss = sum(s["MISSING"] for s in roles_stats.values())
tot_all = sum(s["TOTAL"] for s in roles_stats.values())

for r, s in roles_stats.items():
    pct = round(((s['DONE'] * 1.0 + s['PARTIAL'] * 0.5) / s['TOTAL']) * 100)
    print(f"{r:35s} | Total: {s['TOTAL']:2d} | DONE: {s['DONE']:2d} | PARTIAL: {s['PARTIAL']:2d} | MISSING: {s['MISSING']:2d} | Completed: {pct:3d}%")

overall_pct = round(((tot_done * 1.0 + tot_part * 0.5) / tot_all) * 100)
print(f"\nOVERALL SYSTEM: Total Screens: {tot_all} | DONE: {tot_done} | PARTIAL: {tot_part} | MISSING: {tot_miss} | Progress: {overall_pct}%")
