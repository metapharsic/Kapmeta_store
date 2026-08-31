import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for i in range(17):
    item = data[i]
    fn = item['Filename']
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    filtered = [l for l in lines if not any(x in l for x in [
        "The Finest Restaurant Management Platform",
        "Hotel kapila",
        "POSS",
        "Activate Windows",
        "This is a non-commercial",
        "Type here to search",
        "07969 223344"
    ])]
    print(f"[{i+1:02d}] {fn}")
    print("   -> " + " | ".join(filtered[:8]))
