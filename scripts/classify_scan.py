import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for i, item in enumerate(data):
    fn = item['Filename']
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    
    # Identify title and context
    # Ignore generic title bar "Hotel kapila (R327D38) The Finest Restaurant Management Platform", "New Order", "POSS", "Bill No", "KOT No"
    filtered = [l for l in lines if not any(x in l for x in [
        "The Finest Restaurant Management Platform",
        "Hotel kapila",
        "POSS",
        "Activate Windows",
        "This is a non-commercial",
        "Type here to search",
        "07969 223344"
    ])]
    
    preview = filtered[:8]
    print(f"[{i+1:02d}] {fn}")
    print("   -> " + " | ".join(preview[:6]))
