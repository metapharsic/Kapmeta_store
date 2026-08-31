import os
import shutil

base_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\Screen_shot"
by_role_dir = os.path.join(base_dir, "By_Role")

# Clear existing By_Role directory
if os.path.exists(by_role_dir):
    shutil.rmtree(by_role_dir)

# Role definitions and file mappings
roles_map = {
    "01_Cashier_POS_Operator": {
        "title": "Cashier / Front-Desk Biller / POS Operator",
        "description": "Primary register operations, dine-in table status tracking, billing, settlement, split checks, cash register, and customer checkout.",
        "screens": [
            (1, "Floor_Plan_Table_Status", "Screenshot 2026-08-21 112352.png", "Floor plan and table status (Blank, Running, Printed, Paid, AC/Non-AC zones)"),
            (2, "Floor_Plan_Actions_MoveKOT", "Screenshot 2026-08-21 112418.png", "Floor management actions (Add table, Blank table filter, Move KOT/Items)"),
            (3, "Order_Entry_Menu_Grid", "Screenshot 2026-08-21 112453.png", "New order entry with category navigation rail and item grid"),
            (4, "Order_Entry_Item_Selection", "Screenshot 2026-08-21 112557.png", "Item search and selection in POS billing register"),
            (5, "Order_Entry_Cart_Summary", "Screenshot 2026-08-21 112648.png", "Cart panel with item quantities, pricing, customer details"),
            (6, "Order_Entry_Search_Modifiers", "Screenshot 2026-08-21 112704.png", "Search items and configure modifier/addon selections"),
            (7, "Order_Entry_Comments_Instructions", "Screenshot 2026-08-21 112734.png", "Order-wise customer comments and preparation notes"),
            (8, "Order_Entry_Checkout_Actions", "Screenshot 2026-08-21 112804.png", "Checkout actions: Split bill, Advance order, Print & E-Bill"),
            (26, "Pickup_Order_Settlement", "Screenshot 2026-08-21 113728.png", "Pick-up order details, item list, and cashier billing summary"),
            (29, "Pending_Advance_Orders_Modal", "Screenshot 2026-08-21 113841.png", "Pending order details and advance order queue modal"),
            (30, "Delivery_Container_Charges_Modal", "Screenshot 2026-08-21 113911.png", "Delivery charge, container charge, and total breakdown modal"),
            (38, "Current_Orders_Register", "Screenshot 2026-08-21 114439.png", "Current orders register (Order No, Type, Phone, Amount, Status)")
        ]
    },
    "02_Captain_Waiter_OrderTaking": {
        "title": "Captain / Waiter / Table Steward",
        "description": "Floor table status monitoring, table allocation, dining time tracking, guest order taking, item modifiers, custom notes, and table transfers.",
        "screens": [
            (1, "Floor_Plan_Table_Status", "Screenshot 2026-08-21 112352.png", "Dine-in floor plan, active occupied tables, and elapsed dining timers"),
            (2, "Table_Transfer_Move_KOT", "Screenshot 2026-08-21 112418.png", "Table reallocation, KOT transfer, and multi-table management"),
            (3, "Table_Order_Menu_Browsing", "Screenshot 2026-08-21 112453.png", "Menu browsing by category (Starters, Meals, Curries, Beverages)"),
            (4, "Item_Selection_Punching", "Screenshot 2026-08-21 112557.png", "Table order punching and rapid item selection"),
            (5, "Table_Cart_KOT_Preview", "Screenshot 2026-08-21 112648.png", "Cart preview before sending KOT to kitchen"),
            (7, "Special_Instructions_Cooking_Notes", "Screenshot 2026-08-21 112734.png", "Guest cooking instructions and custom notes for kitchen"),
            (63, "Special_Notes_Presets", "Screenshot 2026-08-21 120300.png", "Special notes presets (Less Masala, Extra Spicy, Jain, etc.)"),
            (65, "Table_Layout_Reference", "Screenshot 2026-08-21 120338.png", "Table roster reference across 45 tables and service zones")
        ]
    },
    "03_Kitchen_Chef_KDS": {
        "title": "Kitchen Staff / Head Chef / KDS Display",
        "description": "Real-time Kitchen Order Tickets (KOT), item preparation tracking, order timer audits, SLA breach alerts, and kitchen print rules.",
        "screens": [
            (18, "KOT_Live_Feed_Tickets", "Screenshot 2026-08-21 113318.png", "Kitchen Order Ticket (KOT) live view with ticket timers and item breakdown"),
            (20, "KOT_Preparation_Progress", "Screenshot 2026-08-21 113406.png", "Kitchen display ticket progression and item preparation tracking"),
            (24, "KOT_Detailed_Item_Listing", "Screenshot 2026-08-21 113556.png", "KOT ticket detailed item listing and preparation status"),
            (25, "KOT_DineIn_Table_Tickets", "Screenshot 2026-08-21 113612.png", "Kitchen view for Dine-In table tickets and modifications"),
            (39, "KOT_Listing_Timer_Audit", "Screenshot 2026-08-21 114508.png", "KOT history listing with preparation timers (e.g. 0hr : 7min) and item counts"),
            (76, "Preparation_Time_Defaults", "Screenshot 2026-08-21 120902.png", "Kitchen food preparation time defaults and item image display options"),
            (77, "KOT_Online_Advance_Print_Rules", "Screenshot 2026-08-21 120917.png", "Automatic KOT printing upon accepting online advance orders")
        ]
    },
    "04_Online_Delivery_Manager": {
        "title": "Online Aggregator & Dispatch Manager (Swiggy / Zomato / Direct)",
        "description": "Managing live incoming aggregator orders, OTP verification, delivery partner status tracking ('Looking for rider', 'ARRIVED'), SLA delay alerts, and store online status.",
        "screens": [
            (16, "Online_Orders_OTP_Verification", "Screenshot 2026-08-21 113222.png", "Live aggregator orders feed, OTP verification, and order timer"),
            (17, "Rider_Status_Call_Customer", "Screenshot 2026-08-21 113250.png", "Order card with Rider status ('Looking for rider', 'ARRIVED'), Call Customer CTA"),
            (19, "Dispatch_Channel_Filter", "Screenshot 2026-08-21 113342.png", "Orders feed filtered by Online, Dine-In, and Delivery channels"),
            (21, "DineIn_vs_Delivery_Dispatch", "Screenshot 2026-08-21 113444.png", "Dispatch comparison between Dine-In and Delivery channels"),
            (22, "Aggregator_Live_Feed_Overview", "Screenshot 2026-08-21 113503.png", "Aggregator live feed with active orders across channels"),
            (23, "Aggregator_Feed_Detail_Timers", "Screenshot 2026-08-21 113518.png", "Aggregator live feed detailed view with time counters"),
            (27, "Online_Orders_Status_Board", "Screenshot 2026-08-21 113753.png", "Current online order board with Zomato and Swiggy status badges"),
            (28, "Food_Ready_SLA_Delay_Alerts", "Screenshot 2026-08-21 113815.png", "Food Ready In Time / Delayed countdown alerts for aggregator riders"),
            (31, "Delivery_Dispatch_Board", "Screenshot 2026-08-21 113936.png", "Live delivery tracking board with platform indicators"),
            (32, "Delivery_Status_Filters", "Screenshot 2026-08-21 114000.png", "Delivery orders queue filtered by status (Food Ready, Out for Delivery)"),
            (33, "Zomato_Live_Order_Coordination", "Screenshot 2026-08-21 114032.png", "Zomato order management card with rider coordination and contact CTA"),
            (34, "Unified_Aggregator_Feed", "Screenshot 2026-08-21 114055.png", "Swiggy and Zomato unified live incoming order stream"),
            (35, "Active_Delivery_Queue_Monitor", "Screenshot 2026-08-21 114158.png", "Active online delivery orders queue and dispatch monitor"),
            (73, "Store_Online_Status_Master_Switch", "Screenshot 2026-08-21 120723.png", "Store online/offline master switch and pending orders monitor")
        ]
    },
    "05_Store_Inventory_Manager": {
        "title": "Store & Inventory Manager",
        "description": "Master item and addon availability control (86-list), online display name overrides, channel-specific catalog toggles, purchase orders, and stock wastage records.",
        "screens": [
            (9, "Item_Availability_Master_Toggle", "Screenshot 2026-08-21 112850.png", "Item On/Off & Addon On/Off master toggle for Online and Offline channels"),
            (10, "Category_Item_Availability", "Screenshot 2026-08-21 112913.png", "Item availability toggles by category (Meal Box, Rice Bowls)"),
            (11, "Swiggy_Channel_Availability", "Screenshot 2026-08-21 112951.png", "Swiggy platform item availability and 86-list controls"),
            (12, "Online_Display_Name_Config", "Screenshot 2026-08-21 113019.png", "Online display name configuration and availability status"),
            (13, "Home_Delivery_Catalog_Toggle", "Screenshot 2026-08-21 113048.png", "Category and item toggle for Home Delivery channel"),
            (14, "Menu_Availability_Sync", "Screenshot 2026-08-21 113117.png", "Category level item status synchronization"),
            (15, "MultiChannel_Availability_Sync", "Screenshot 2026-08-21 113142.png", "Online vs Offline status across aggregator channels"),
            (62, "Offline_Only_Billing_Filter", "Screenshot 2026-08-21 120238.png", "Item filter for offline-only billing vs aggregator channels"),
            (70, "Inventory_Purchase_Wastage_Hub", "Screenshot 2026-08-21 120540.png", "Inventory purchase management, raw material tracking, and wastage logging")
        ]
    },
    "06_Restaurant_Manager_Admin": {
        "title": "Restaurant Manager / Outlet General Admin",
        "description": "Menu master catalog (275 items), area and table layout configurations, staff biller profiles, CRM database, aggregator feedback/complaint audits, and custom order statuses.",
        "screens": [
            (36, "Operations_Hub_Billing_Nav", "Screenshot 2026-08-21 114253.png", "Operations version and module quick-access navigation hub"),
            (37, "Operations_Hub_CashFlow_Menu", "Screenshot 2026-08-21 114313.png", "Operations hub for cash flow, menu, customers, and inventory"),
            (58, "Custom_Order_Status_Config", "Screenshot 2026-08-21 120112.png", "Configuration of custom order workflow statuses in real-time"),
            (60, "Menu_Configuration_Dashboard", "Screenshot 2026-08-21 120202.png", "Menu management dashboard: items, special notes, areas, tables"),
            (61, "Menu_Item_Master_275Items", "Screenshot 2026-08-21 120218.png", "Item listing table: 275 items, short code, category, prices, status"),
            (63, "Special_Notes_Master", "Screenshot 2026-08-21 120300.png", "Special notes listing (Less Masala, Extra Spicy, Jain, etc.)"),
            (64, "Area_Management_6Areas", "Screenshot 2026-08-21 120318.png", "Area listing: 6 configured zones (AC, Non-AC, Parcel, Swiggy, Zomato)"),
            (65, "Table_Master_45Tables", "Screenshot 2026-08-21 120338.png", "Table listing: 45 configured tables with capacity and area assignment"),
            (67, "Customer_Database_CRM", "Screenshot 2026-08-21 120438.png", "Customer listing: customer names, mobile numbers, visit history, loyalty"),
            (68, "Customer_Feedback_Complaints", "Screenshot 2026-08-21 120500.png", "Aggregator feedback and complaint tracking (Zomato/Swiggy ratings & issues)"),
            (71, "Operations_Master_Hub", "Screenshot 2026-08-21 120611.png", "Main operations hub: cash flow, customers, system settings, menu on/off"),
            (72, "Staff_Biller_Profiles_Master", "Screenshot 2026-08-21 120632.png", "Biller profile listing: staff accounts, biller usernames, access profiles")
        ]
    },
    "07_Accountant_Auditor_Finance": {
        "title": "Accountant / Auditor / Financial Controller",
        "description": "Statutory GST tax rules (forward vs backward tax), executive sales summaries, payment type reconciliations (Cash, Card, UPI, Swiggy, Zomato, Room Service), item/category sales, returns and complimentary orders audit.",
        "screens": [
            (66, "Tax_Master_GST_Setup", "Screenshot 2026-08-21 120409.png", "Tax listing: CGST 2.5%, SGST 2.5%, Backward tax (Dine-in) vs Forward tax (Online)"),
            (84, "Reports_BI_Analytics_Hub", "Screenshot 2026-08-21 121214.png", "Reports navigation hub: Category, Item, Order, Executive Sales, Employee, Tax"),
            (85, "Category_Sales_Report", "Screenshot 2026-08-21 121257.png", "Category-wise sales volume, order counts, revenue rollups"),
            (86, "Item_Sales_Report", "Screenshot 2026-08-21 121314.png", "Item-wise sales quantity, item code/SKU, category totals, revenue"),
            (87, "Order_Sales_Audit_Ledger", "Screenshot 2026-08-21 121334.png", "Order-by-order audit ledger with payment modes, totals, timestamps"),
            (88, "Executive_Sales_Summary", "Screenshot 2026-08-21 121352.png", "Executive sales summary: gross sales, net sales, taxes, discounts"),
            (89, "DayEnd_Settlement_Swiggy_Summary", "Screenshot 2026-08-21 121413.png", "Day-end payment type breakdown and Swiggy online settlements"),
            (90, "Payment_Reconciliation_Returns", "Screenshot 2026-08-21 121428.png", "Settlement report: Cash, Card, UPI, Room Service, Due, Complimentary, Returns")
        ]
    },
    "08_System_IT_Hardware_Admin": {
        "title": "IT Systems, Hardware & Database Administrator",
        "description": "POS billing preferences, printer routing and thermal layout typography, COM customer pole displays, LAN client-server sync (Main Server IP 192.168.29.33), DB migrations, purge tools, and connectivity diagnostic logs.",
        "screens": [
            (40, "Billing_Config_Defaults", "Screenshot 2026-08-21 114546.png", "Billing Screen Configuration: default order type, payment type, default table"),
            (41, "Billing_Config_Charges_Calc", "Screenshot 2026-08-21 115059.png", "Delivery charge and container charge calculation rules"),
            (42, "Billing_Config_Phone_Validation", "Screenshot 2026-08-21 115117.png", "Customer phone validation and duplicate item merge settings"),
            (43, "Billing_Config_Table_Rules", "Screenshot 2026-08-21 115135.png", "Item sorting (A-Z), discount area defaults, table locking & release rules"),
            (44, "Billing_Config_Stock_Focus", "Screenshot 2026-08-21 115152.png", "Default focus when adding items, action on out-of-stock items"),
            (45, "Billing_Config_KOT_Display", "Screenshot 2026-08-21 115209.png", "KOT display preferences, order-wise information display"),
            (46, "Billing_Config_Tips_Loyalty", "Screenshot 2026-08-21 115227.png", "Set tip value, tip selection modes, loyalty data sync settings"),
            (47, "Print_Configuration_Overview", "Screenshot 2026-08-21 115254.png", "Bill / KOT print configuration main settings"),
            (48, "Printer_Listing_Device_Manager", "Screenshot 2026-08-21 115312.png", "Manage printers list, printer types, e-bill and physical printers"),
            (49, "Add_Printer_Port_Setup", "Screenshot 2026-08-21 115429.png", "Add new printer dialog, printer name, device driver, printer role selection"),
            (50, "Print_Layout_Header_WelcomeMsg", "Screenshot 2026-08-21 115814.png", "Bill print settings: highlight order ID, customer welcome message, Sr No column"),
            (51, "Print_Layout_Notes_TaxBreakdown", "Screenshot 2026-08-21 115830.png", "Customer notes on bill, tax breakdown display, special notes print toggle"),
            (52, "Print_Layout_Due_Typography", "Screenshot 2026-08-21 115851.png", "Customer due amount on bill, item box height, bill font size settings"),
            (53, "Print_Layout_ColumnWidths_Rows", "Screenshot 2026-08-21 115906.png", "Item price column width, line height between rows, items per page limit"),
            (54, "Print_Layout_Backward_Tax", "Screenshot 2026-08-21 115920.png", "Order type options, with/without backward tax printing toggle"),
            (55, "Print_Layout_SpecialNotes_OnlineStatus", "Screenshot 2026-08-21 115955.png", "Item-wise priority, addon/special notes font size, online payment status marker"),
            (56, "Print_Layout_KOT_Modification_Rules", "Screenshot 2026-08-21 120017.png", "Print only modified items in KOT, print deleted items in separate KOT"),
            (57, "Print_Layout_Barcodes_ErrorAlerts", "Screenshot 2026-08-21 120035.png", "Order barcodes on bill & KOT, full order ID format, printer error alerts"),
            (59, "Advanced_Search_System_Shortcuts", "Screenshot 2026-08-21 120129.png", "System-wide preference search and navigation shortcuts"),
            (69, "Customer_Display_Pole_LED_VFD", "Screenshot 2026-08-21 120524.png", "LED display settings: COM port, Baud rate, serial communication"),
            (74, "Restaurant_System_Config_Hub", "Screenshot 2026-08-21 120758.png", "Restaurant configuration tiles: Reset Bill No, Migration, Logs, Machines"),
            (75, "System_Timers_Sync_Rates", "Screenshot 2026-08-21 120842.png", "Default order limit, pending order sync interval, captain intranet sync time"),
            (78, "System_Maintenance_Hub", "Screenshot 2026-08-21 120941.png", "Reset sync code, database migration, reset bill no, remove backup files"),
            (79, "Database_Migration_Utility", "Screenshot 2026-08-21 121003.png", "Database migration tool and schema updater"),
            (80, "Data_Purge_Orders_KOTs", "Screenshot 2026-08-21 121024.png", "Remove all orders and KOTs test data cleanup tool"),
            (81, "Backup_Files_Cleanup", "Screenshot 2026-08-21 121047.png", "Remove local backup files and storage cleanup tool"),
            (82, "System_Connectivity_Logs", "Screenshot 2026-08-21 121108.png", "Internet connectivity logs, server sync logs, error diagnostics"),
            (83, "LAN_Architecture_Machines_IPs", "Screenshot 2026-08-21 121130.png", "Machines setup: Main Server IP (192.168.29.33) vs Client Machine IP")
        ]
    }
}

os.makedirs(by_role_dir, exist_ok=True)

# Generate master README.md inside By_Role
master_readme_path = os.path.join(by_role_dir, "README.md")
with open(master_readme_path, "w", encoding="utf-8") as mrf:
    mrf.write("# Role-Based Screen Index for PetPooja POS System\n\n")
    mrf.write("All 90 screenshots captured from the PetPooja POS platform have been categorized and organized role-wise into dedicated subfolders.\n\n")
    mrf.write("## Summary of Roles\n\n")
    mrf.write("| Directory | Role Name | Screen Count | Core Responsibility |\n")
    mrf.write("|---|---|:---:|---|\n")
    for r_dir, data in roles_map.items():
        mrf.write(f"| [`{r_dir}/`](./{r_dir}/) | **{data['title']}** | **{len(data['screens'])}** | {data['description']} |\n")
    mrf.write("\n---\n\n")

total_copied = 0
for role_dir, data in roles_map.items():
    role_folder = os.path.join(by_role_dir, role_dir)
    os.makedirs(role_folder, exist_ok=True)
    
    # Write README.md inside each role folder
    readme_path = os.path.join(role_folder, "README.md")
    with open(readme_path, "w", encoding="utf-8") as rf:
        rf.write(f"# {data['title']}\n\n")
        rf.write(f"**Directory:** `Screen_shot/By_Role/{role_dir}/`  \n")
        rf.write(f"**Total Screens:** {len(data['screens'])}\n\n")
        rf.write(f"### Description\n{data['description']}\n\n")
        rf.write("### Screen Catalog\n\n")
        rf.write("| Screen ID | Formatted Filename | Original Source | Description & Function |\n")
        rf.write("|:---:|---|---|---|\n")
        
        for num, title, src_file, desc in data['screens']:
            src_path = os.path.join(base_dir, src_file)
            dest_file = f"{num:02d}_{title}.png"
            dest_path = os.path.join(role_folder, dest_file)
            
            if os.path.exists(src_path):
                shutil.copy2(src_path, dest_path)
                total_copied += 1
            else:
                print(f"WARNING: Missing file: {src_path}")
            
            rf.write(f"| **{num:02d}** | [`{dest_file}`](./{dest_file}) | `{src_file}` | {desc} |\n")

print(f"Done! Master README and 8 Role directories created with {total_copied} cleanly named image files.")
