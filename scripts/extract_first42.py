import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for i in range(42):
    item = data[i]
    fn = item['Filename']
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    headers = []
    for l in lines:
        for kw in ["Listing", "Report", "Configuration", "Settings", "Management", "Summary", "View", "Order", "Printer", "Table", "Feedback", "Logs", "Preparation", "Biller", "Customer", "Area", "Special Note", "Item", "Category", "Cash Flow", "Swiggy", "Zomato", "Tax", "Machines", "Migration", "KOT", "Dine In", "Delivery", "Pick Up", "Hold", "Online", "Out of Stock"]:
            if kw.lower() in l.lower() and len(l) < 50:
                headers.append(l)
    print(f"[{i+1:02d}] {fn}")
    print(f"   Tokens: {list(dict.fromkeys(headers))[:6]}")
