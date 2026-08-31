import os
import re

pages_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\pages"
comp_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\components"

files = []
for root, dirs, filenames in os.walk(pages_dir):
    for f in filenames:
        if f.endswith('.tsx') or f.endswith('.ts'):
            files.append(os.path.join(root, f))

for root, dirs, filenames in os.walk(comp_dir):
    for f in filenames:
        if f.endswith('.tsx') or f.endswith('.ts'):
            files.append(os.path.join(root, f))

print(f"Total frontend source files found: {len(files)}")

# Let's inspect keywords in these files
keywords = [
    "printer", "print", "tax", "backward", "forward", "cgst", "sgst", "com port", "baud",
    "lan", "main server", "machine", "192.168", "backup", "migration", "reset bill", "purge",
    "special note", "less masala", "biller profile", "feedback", "complaints",
    "container charge", "delivery charge", "advance order", "otp", "looking for rider", "arrived",
    "item on/off", "addon on/off", "online display name", "wastage", "purchase",
    "executive sales", "day end", "sales return", "complimentary", "category report", "item report"
]

results = {kw: [] for kw in keywords}

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().lower()
            rel_path = os.path.relpath(filepath, r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web")
            for kw in keywords:
                if kw in content:
                    results[kw].append(rel_path)
    except Exception as e:
        pass

print("\n--- KEYWORD COVERAGE IN FRONTEND ---")
for kw, matches in results.items():
    print(f"Keyword '{kw}': found in {len(matches)} files -> {', '.join(matches[:3])}")
