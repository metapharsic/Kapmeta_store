import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

print(f"Total screenshots: {len(data)}")
for i, item in enumerate(data):
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    top_lines = lines[:5] if len(lines) >= 5 else lines
    print(f"[{i+1:02d}] {item['Filename']} => {' | '.join(top_lines)}")
