import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

# Define mapping rules for each screenshot based on deep analysis
screen_mappings = [
    # 01 - 08: Floor Plan & Billing
    (1, "01_Cashier_POS_Operator", "Floor Plan & Table Status", "Table floor view (AC/Non-AC zones, table statuses, elapsed time, running amounts)"),
    (2, "01_Cashier_POS_Operator", "Floor Plan & Table Actions", "Table management actions (Add Table, Blank table filters, Move KOT/Items)"),
    (3, "01_Cashier_POS_Operator", "Order Entry & Menu Grid", "New Order screen with category rail and item grid (Breakfast, Beverages, etc.)"),
    (4, "01_Cashier_POS_Operator", "Order Entry - Item Selection", "Item selection and search in POS billing register"),
    (5, "01_Cashier_POS_Operator", "Order Entry - Cart & Ticket", "Cart panel with item quantities, pricing, customer details"),
    (6, "01_Cashier_POS_Operator", "Order Entry - Search & Modifiers", "Item search and modifier/addon selection in register"),
    (7, "01_Cashier_POS_Operator", "Order Entry - Comments & Notes", "Order-wise comments and customer instruction capture"),
    (8, "01_Cashier_POS_Operator", "Order Entry - Checkout Ready", "Order review and checkout actions (Split, Advance Order, Print & E-Bill)"),
    
    # 09 - 15: Store / Inventory - Item Availability
    (9, "05_Store_Inventory_Manager", "Item Availability - Channel Master", "Item On/Off & Addon On/Off master toggle for Online/Offline"),
    (10, "05_Store_Inventory_Manager", "Item Availability - Category View", "Item availability toggles by category (Meal Box, Rice Bowls)"),
    (11, "05_Store_Inventory_Manager", "Item Availability - Swiggy Channel", "Swiggy platform item availability and 86-list controls"),
    (12, "05_Store_Inventory_Manager", "Item Availability - Online Display Names", "Online display name configuration and availability status"),
    (13, "05_Store_Inventory_Manager", "Item Availability - Home Delivery Catalog", "Category & item toggle for Home Delivery channel"),
    (14, "05_Store_Inventory_Manager", "Item Availability - Menu Sync", "Category level item status synchronization"),
    (15, "05_Store_Inventory_Manager", "Item Availability - Multi-Channel Sync", "Online vs Offline status across aggregator channels"),
    
    # 16 - 17: Online Delivery - Live Feed
    (16, "04_Online_Delivery_Manager", "Live Feed - New Orders & OTP", "Live online orders feed (Swiggy/Zomato), OTP verification, order timer"),
    (17, "04_Online_Delivery_Manager", "Live Feed - Rider Tracking", "Online order card with Rider status ('Looking for rider'), Call Customer CTA"),
    
    # 18: KDS / Kitchen
    (18, "03_Kitchen_Chef_KDS", "KOT Live View - Ticket Feed", "Kitchen Order Ticket (KOT) live view with ticket timers and item breakdown"),
    
    # 19: Online Delivery
    (19, "04_Online_Delivery_Manager", "Order Dispatch - Channel Filter", "Order view filtered by Online, Dine-In, Delivery channels"),
    
    # 20: KDS / Kitchen
    (20, "03_Kitchen_Chef_KDS", "KOT Live View - Preparation Status", "Kitchen display ticket progression and item preparation details"),
    
    # 21: Online Delivery / Cashier
    (21, "04_Online_Delivery_Manager", "Order View - Dine In vs Delivery", "Order view comparison between Dine-In and Delivery channels"),
    
    # 22 - 23: Online Delivery
    (22, "04_Online_Delivery_Manager", "Order Live View - Aggregator Feed", "Aggregator live feed with active orders across channels"),
    (23, "04_Online_Delivery_Manager", "Order Live View - Detail Overview", "Aggregator live feed detailed view with time counters"),
    
    # 24 - 25: KDS / Kitchen
    (24, "03_Kitchen_Chef_KDS", "KOT Live View - Order Items Breakdown", "KOT ticket detailed item listing and preparation status"),
    (25, "03_Kitchen_Chef_KDS", "KOT Live View - Dine-In Tickets", "Kitchen view for Dine-In table tickets and modifications"),
    
    # 26: Cashier / POS Operator
    (26, "01_Cashier_POS_Operator", "Pick-up Order Settlement", "Pick up order details, item list, and cashier billing summary"),
    
    # 27 - 28: Online Delivery
    (27, "04_Online_Delivery_Manager", "Online Orders - Live Status Board", "Current online order board with Zomato/Swiggy status badges"),
    (28, "04_Online_Delivery_Manager", "Food Ready & SLA Delay Alerts", "Food Ready In Time / Delayed countdown alerts for aggregator riders"),
    
    # 29 - 30: Cashier / POS Operator
    (29, "01_Cashier_POS_Operator", "Pending & Advance Orders", "Pending order details and advance order queue modal"),
    (30, "01_Cashier_POS_Operator", "Charges & Total Calculation", "Delivery charge, container charge, and service charge breakdown"),
    
    # 31 - 35: Online Delivery
    (31, "04_Online_Delivery_Manager", "Live Delivery Dispatch Board", "Current online orders tracking board with aggregator badges"),
    (32, "04_Online_Delivery_Manager", "Delivery Order Status Filter", "Current delivery orders list filtered by status and channel"),
    (33, "04_Online_Delivery_Manager", "Zomato Live Order Management", "Zomato order management card with rider coordination and contact CTA"),
    (34, "04_Online_Delivery_Manager", "Aggregator Channel Feed", "Swiggy and Zomato unified live incoming feed"),
    (35, "04_Online_Delivery_Manager", "Active Delivery Queue", "Active online delivery orders queue and dispatch monitor"),
    
    # 36 - 37: Restaurant Manager / Admin
    (36, "06_Restaurant_Manager_Admin", "Operations Hub - Orders & Billing", "Operations version and module quick-access navigation hub"),
    (37, "06_Restaurant_Manager_Admin", "Operations Hub - Cash Flow & Menu", "Operations hub for cash flow, menu, customers, and inventory"),
    
    # 38: Cashier / POS Operator
    (38, "01_Cashier_POS_Operator", "Current Order Register", "Current orders register with order numbers, customer details, and amounts"),
    
    # 39: KDS / Kitchen
    (39, "03_Kitchen_Chef_KDS", "KOT Listing & Preparation Audit", "KOT history listing with preparation timers (e.g., 0hr : 7min) and item counts"),
    
    # 40 - 46: IT Admin / Hardware / POS Settings
    (40, "08_System_IT_Hardware_Admin", "Billing Configuration - Defaults", "Billing Screen Configuration: default order type, payment type, default table"),
    (41, "08_System_IT_Hardware_Admin", "Billing Configuration - Charges", "Delivery charge and container charge calculation rules"),
    (42, "08_System_IT_Hardware_Admin", "Billing Configuration - Validation", "Customer phone validation and duplicate item merge settings"),
    (43, "08_System_IT_Hardware_Admin", "Billing Configuration - Table Rules", "Item sorting (A-Z), discount area defaults, table locking & release rules"),
    (44, "08_System_IT_Hardware_Admin", "Billing Configuration - Stock Rules", "Default focus when adding items, action on out-of-stock items"),
    (45, "08_System_IT_Hardware_Admin", "Billing Configuration - Info Display", "KOT display preferences, order-wise information display"),
    (46, "08_System_IT_Hardware_Admin", "Billing Configuration - Tips & Loyalty", "Set tip value, tip selection modes, loyalty data sync settings"),
    
    # 47 - 57: IT Admin / Hardware / Printers & Print Layouts
    (47, "08_System_IT_Hardware_Admin", "Print Configuration - Overview", "Bill / KOT print configuration main settings"),
    (48, "08_System_IT_Hardware_Admin", "Printer Listing & Device Manager", "Manage printers list, printer types, e-bill and physical printers"),
    (49, "08_System_IT_Hardware_Admin", "Add Printer & Port Setup", "Add new printer dialog, printer name, device driver, printer role selection"),
    (50, "08_System_IT_Hardware_Admin", "Print Layout - Header & Customer Msg", "Bill print settings: highlight order ID, customer welcome message, Sr No column"),
    (51, "08_System_IT_Hardware_Admin", "Print Layout - Notes & Tax Breakdown", "Customer notes on bill, tax breakdown display, special notes print toggle"),
    (52, "08_System_IT_Hardware_Admin", "Print Layout - Due Amount & Typography", "Customer due amount on bill, item box height, bill font size settings"),
    (53, "08_System_IT_Hardware_Admin", "Print Layout - Column Widths & Spacing", "Item price column width, line height between rows, items per page limit"),
    (54, "08_System_IT_Hardware_Admin", "Print Layout - Backward Tax Formatting", "Order type options, with/without backward tax printing toggle"),
    (55, "08_System_IT_Hardware_Admin", "Print Layout - Special Notes & Online Status", "Item-wise priority, addon/special notes font size, online payment status marker"),
    (56, "08_System_IT_Hardware_Admin", "Print Layout - KOT Modification Rules", "Print only modified items in KOT, print deleted items in separate KOT"),
    (57, "08_System_IT_Hardware_Admin", "Print Layout - Barcodes & Error Alerts", "Order barcodes on bill & KOT, full order ID format, printer error alerts"),
    
    # 58: Restaurant Manager / Admin
    (58, "06_Restaurant_Manager_Admin", "Custom Order Status Config", "Configuration of custom order workflow statuses in real-time"),
    
    # 59: IT Admin
    (59, "08_System_IT_Hardware_Admin", "Advanced Search & System Preferences", "System-wide preference search and navigation shortcuts"),
    
    # 60 - 65: Restaurant Manager / Admin - Catalog & Outlets
    (60, "06_Restaurant_Manager_Admin", "Menu Configuration Dashboard", "Menu management dashboard: items, special notes, areas, tables"),
    (61, "06_Restaurant_Manager_Admin", "Menu Item Master (275 Items)", "Item listing table: 275 items, short code, category, prices, status"),
    (62, "05_Store_Inventory_Manager", "Item Channel Availability Filter", "Item filter by offline billing availability vs online aggregators"),
    (63, "06_Restaurant_Manager_Admin", "Special Notes Master", "Special notes listing (Less Masala, Extra Spicy, Jain, etc.)"),
    (64, "06_Restaurant_Manager_Admin", "Area Management (6 Areas)", "Area listing: 6 configured zones (AC, Non-AC, Parcel, Swiggy, Zomato, etc.)"),
    (65, "06_Restaurant_Manager_Admin", "Table Master (45 Tables)", "Table listing: 45 configured tables with capacity and area assignment"),
    
    # 66: Accountant / Auditor
    (66, "07_Accountant_Auditor_Reports", "Tax Master & GST Configuration", "Tax listing: CGST 2.5%, SGST 2.5%, Backward tax (Dine-in) vs Forward tax (Online)"),
    
    # 67 - 68: Restaurant Manager / CRM
    (67, "06_Restaurant_Manager_Admin", "Customer Database & CRM", "Customer listing: customer names, mobile numbers, visit history, loyalty"),
    (68, "06_Restaurant_Manager_Admin", "Customer Feedback & Complaints", "Aggregator feedback and complaint tracking (Zomato/Swiggy ratings & issues)"),
    
    # 69: IT Admin / Hardware
    (69, "08_System_IT_Hardware_Admin", "Customer Display Pole (LED/VFD)", "LED display settings: COM port, Baud rate, serial communication"),
    
    # 70: Store / Inventory Manager
    (70, "05_Store_Inventory_Manager", "Inventory & Purchase Management", "Inventory purchase management, raw material tracking, and wastage logging"),
    
    # 71 - 72: Restaurant Manager / Admin
    (71, "06_Restaurant_Manager_Admin", "Operations Master Hub", "Main operations hub: cash flow, customers, system settings, menu on/off"),
    (72, "06_Restaurant_Manager_Admin", "Staff & Biller Profile Master", "Biller profile listing: staff accounts, biller usernames, access profiles"),
    
    # 73: Online Delivery Manager
    (73, "04_Online_Delivery_Manager", "Store Status & Online Outlet Switch", "Store online/offline master switch, pending orders monitor"),
    
    # 74 - 77: IT Admin & Restaurant Config
    (74, "08_System_IT_Hardware_Admin", "Restaurant System Config Hub", "Restaurant configuration tiles: Reset Bill No, Migration, Logs, Machines"),
    (75, "08_System_IT_Hardware_Admin", "System Timers & Sync Rates", "Default order limit, pending order sync interval, captain intranet sync time"),
    (76, "03_Kitchen_Chef_KDS", "Preparation Time & Billing Images", "Preparation time defaults, font configuration, billing item images toggle"),
    (77, "03_Kitchen_Chef_KDS", "KOT Live View Online Rules", "Print KOT on accepting online advance orders, live view default login"),
    
    # 78 - 83: IT Admin / Maintenance & LAN Sync
    (78, "08_System_IT_Hardware_Admin", "System Maintenance Hub", "Reset sync code, database migration, reset bill no, remove backup files"),
    (79, "08_System_IT_Hardware_Admin", "Database Migration Utility", "Database migration tool and schema updater"),
    (80, "08_System_IT_Hardware_Admin", "Order & KOT Data Purge Tool", "Remove all orders and KOTs test data cleanup tool"),
    (81, "08_System_IT_Hardware_Admin", "Backup Files Purge Tool", "Remove local backup files and storage cleanup tool"),
    (82, "08_System_IT_Hardware_Admin", "System & Connectivity Logs", "Internet connectivity logs, server sync logs, error diagnostics"),
    (83, "08_System_IT_Hardware_Admin", "LAN Architecture & Machine IPs", "Machines setup: Main Server IP (192.168.29.33) vs Client Machine IP"),
    
    # 84 - 90: Accountant / Auditor / Reports
    (84, "07_Accountant_Auditor_Reports", "Reports & BI Analytics Hub", "Reports navigation hub: Category, Item, Order, Executive Sales, Employee, Tax"),
    (85, "07_Accountant_Auditor_Reports", "Category Sales Report", "Category-wise sales volume, order counts, revenue rollups"),
    (86, "07_Accountant_Auditor_Reports", "Item Sales Report", "Item-wise sales quantity, item code/SKU, category totals, revenue"),
    (87, "07_Accountant_Auditor_Reports", "Order Sales Audit Report", "Order-by-order audit ledger with payment modes, totals, timestamps"),
    (88, "07_Accountant_Auditor_Reports", "Executive Sales Summary", "Executive sales summary: gross sales, net sales, taxes, discounts"),
    (89, "07_Accountant_Auditor_Reports", "Day-End Settlement & Swiggy Summary", "Day-end payment type breakdown and Swiggy online settlements"),
    (90, "07_Accountant_Auditor_Reports", "Payment Reconciliation & Returns", "Settlement report: Cash, Card, UPI, Room Service, Due, Complimentary, Sales Returns")
]

print(f"Total mappings defined: {len(screen_mappings)}")

# Group by role
roles = {}
for idx, role, screen_name, desc in screen_mappings:
    if role not in roles:
        roles[role] = []
    item = data[idx-1]
    roles[role].append({
        "index": idx,
        "filename": item['Filename'],
        "screen_name": screen_name,
        "description": desc
    })

for role, items in roles.items():
    print(f"\n=======================================================")
    print(f"ROLE: {role} ({len(items)} screens)")
    print(f"=======================================================")
    for it in items:
        print(f"  [{it['index']:02d}] {it['filename']} -> {it['screen_name']}")
