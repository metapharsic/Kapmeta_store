import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for i, item in enumerate(data):
    fn = item['Filename']
    lines = item.get('Lines', [])
    text = " ".join(lines).lower()
    
    # Let's see what is on each screen
    print(f"--- SCREEN {i+1:02d}: {fn} ---")
    # Identify key elements
    key_lines = [l for l in lines if len(l.strip()) > 2][:10]
    for l in key_lines:
        print(f"  {l}")
