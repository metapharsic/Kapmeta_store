import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

print(f"Total screenshots: {len(data)}")

for i, item in enumerate(data):
    fn = item['Filename']
    lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
    text = " ".join(lines)
    print(f"[{i+1:02d}] {fn}")
    # print up to 5 informative lines
    filtered = [l for l in lines if not any(x in l for x in ["The Finest Restaurant", "Hotel kapila", "POSS", "Activate Windows", "This is a non-commercial", "07969 223344"])]
    for l in filtered[:4]:
        print(f"     {l}")
