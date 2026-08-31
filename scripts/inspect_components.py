import os

comp_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\components"

for comp in os.listdir(comp_dir):
    if comp.endswith('.tsx'):
        path = os.path.join(comp_dir, comp)
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        print(f"COMP: {comp:30s} | Lines: {len(lines):4d} | Header/Props: {lines[0].strip()[:60]}")
