import json

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\ocr_results.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

with open(r'c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\all_screens_dump.txt', 'w', encoding='utf-8') as out:
    for i, item in enumerate(data):
        fn = item['Filename']
        lines = [l.strip() for l in item.get('Lines', []) if l.strip()]
        out.write(f"================================================================================\n")
        out.write(f"INDEX: {i+1:02d} | FILE: {fn}\n")
        out.write(f"================================================================================\n")
        for line in lines:
            out.write(f"  {line}\n")
        out.write("\n\n")

print("Dumped all screens text to scripts/all_screens_dump.txt")
