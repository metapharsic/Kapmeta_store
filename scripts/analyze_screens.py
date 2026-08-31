import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for i, item in enumerate(data):
    fn = item['Filename']
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    full_text = " ".join(lines)
    
    # print summary
    print(f"=== [{i+1:02d}] {fn} ===")
    print(f"All lines count: {len(lines)}")
    print(f"Top 10 lines: {lines[:10]}")
    print()
