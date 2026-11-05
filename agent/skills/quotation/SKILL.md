---
name: quotation
description: Make a GQ Projects quotation PDF in the company's standard layout (logo, bill-to, item table, total, lead time, payment terms, terms and conditions, acceptance line). Use when someone asks to make, draft, redo or change a quotation, quote or estimate for a customer.
---
# Quotation

Turns what Vicky tells you about a job into a quotation PDF that always looks the same: the layout of quote GQ5087.
Company details, bank, contact, lead time, payment terms and the 10 terms and conditions live in `company.json`;
change them there, never per quote, unless she asks for a one-off.

## 1. Gather the quote
Ask only for what she hasn't said, one multiple-choice question at a time where you can offer choices:
- **Quote number** (e.g. `GQ5088`). Never invent one for a real customer; ask.
- **Customer**: company name, address lines, phone.
- **Project name** and **salesperson** (default: Vicky Lee).
- **Estimate date** (default: today). Expiry defaults to one month later.
- **Items**: for each, the title, product codes and spec lines, quantity, unit (`sqft`, `sqm`, `ls`, `m`, `ctn`) and
  rate. Rates already include SST, as in the example. Optional product photo (a file path).
- **Notes** above the lead time, if any.

## 2. Write the quote file
Save `<number> <project>.json` in `~/Documents/GQ Quotations/` (create the folder if missing):

```json
{
  "number": "GQ5087",
  "estimateDate": "15-10-2026",
  "project": "GSC TRX Level 1 Event Hall",
  "salesperson": "Vicky Lee",
  "customer": {
    "name": "Golden Screen Cinemas Sdn Bhd",
    "address": ["No 1 Jalan SS 22/19", "Damansara Jaya", "Petaling Jaya 47400", "Selangor"],
    "phone": "0378068802"
  },
  "items": [
    {
      "title": "Carpet Tile: 31X1 Dunhuang",
      "image": "dunhuang.jpg",
      "lines": ["31X1-A02", "Name: Dunhuang", "Yarn: Nylon", "", "", "Area: Level 1 Event Hall",
                "Remarks:", "1) Quantity is subject to changed base on site measurement.", "",
                "Job Scope: To supply and install carpet tile"],
      "qty": 8395.95, "unit": "sqft", "rate": 10.50
    }
  ]
}
```

- Dates are `DD-MM-YYYY`. `qty` and `rate` are plain numbers, no commas or currency.
- In `lines`, an empty string leaves a blank line. Follow the example's order: product codes, specs, blank lines, Area,
  Remarks, blank, Job Scope.
- Optional keys: `expiryDate`, `notes` (list of lines), and one-off overrides `leadTime`, `paymentTerms`, `contact`,
  `terms` (same shape as in `company.json`).
- Image paths are relative to the quote file.

## 3. Make the PDF
Run `/usr/bin/python3 ~/.claude/skills/quotation/render.py "<quote file>"`. It works out every amount (qty times rate,
rounded to the cent) and the total itself; never type amounts in.
- `PDF <path>`: done. Open it with `open "<path>"` so she sees it.
- `quote problem: ...`: fix the quote file and run again.
- `NO_BROWSER <path>`: no Chrome on this Mac. Open the `.html` with `open -a Safari "<path>"` and tell her:
  "1. Press **Command + P**. 2. Click **PDF** at the bottom left, then **Save as PDF**."

## 4. Check with her
Tell her the total and the expiry date in one line, then ask (multiple-choice) whether it looks right. Change the quote
file and render again until she says yes. The PDF is hers to send; never email it yourself.
