import os

pages_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\pages"
comp_dir = r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\components"

def inspect_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    # Find components, headers, main tabs, and state
    print(f"\n=======================================================")
    print(f"FILE: {os.path.basename(path)} ({len(lines)} lines)")
    print(f"=======================================================")
    # Print key sections
    for i, line in enumerate(lines[:30]):
        print(f"  {line}")

for p in ["waiter.tsx", "orders.tsx", "kitchen.tsx", "channel-availability.tsx", "inventory.tsx", "menu.tsx", "table-management.tsx", "user-management.tsx", "crm.tsx", "finance.tsx", "admin.tsx"]:
    filepath = os.path.join(pages_dir, p)
    if os.path.exists(filepath):
        inspect_file(filepath)
