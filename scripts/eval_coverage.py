import os
import re

# Load all 90 screens mappings
with open(r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\scripts\separate_screens_by_role.py", "r", encoding="utf-8") as f:
    text = f.read()

# Let's inspect the exact implementation of key components
def read_comp(name):
    p = os.path.join(r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\components", name)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def read_page(name):
    p = os.path.join(r"c:\Users\BEST BUY\Downloads\PetPooja\PetPooja\apps\pos-web\pages", name)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""

print("PosBillingView lines:", len(read_comp("PosBillingView.tsx").split('\n')))
print("TableViewFloor lines:", len(read_comp("TableViewFloor.tsx").split('\n')))
print("AggregatorOrdersView lines:", len(read_comp("AggregatorOrdersView.tsx").split('\n')))
print("kitchen.tsx lines:", len(read_page("kitchen.tsx").split('\n')))
print("finance.tsx lines:", len(read_page("finance.tsx").split('\n')))
print("admin.tsx lines:", len(read_page("admin.tsx").split('\n')))
print("inventory.tsx lines:", len(read_page("inventory.tsx").split('\n')))
