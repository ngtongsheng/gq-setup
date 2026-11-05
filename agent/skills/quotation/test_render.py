import datetime
import json
import os
import unittest
from decimal import Decimal

import render

COMPANY = json.load(open(os.path.join(render.HERE, "company.json"), encoding="utf-8"))


def quote(**changes):
    base = {
        "number": "GQ5087", "estimateDate": "15-10-2026", "project": "GSC TRX Level 1 Event Hall",
        "salesperson": "Vicky Lee", "customer": {"name": "Golden Screen Cinemas Sdn Bhd"},
        "items": [
            {"title": "Carpet Tile: 31X1 Dunhuang", "qty": 8395.95, "unit": "sqft", "rate": 10.5},
            {"title": "Charges: Night Work (ls)", "qty": 1, "unit": "ls", "rate": 1000},
        ],
    }
    base.update(changes)
    return base


class MoneyTest(unittest.TestCase):
    def test_matches_the_gq5087_example(self):
        items = quote()["items"]
        self.assertEqual(render.line_amount(items[0]), Decimal("88157.48"))
        self.assertEqual(render.quote_total(items), Decimal("89157.48"))

    def test_total_in_page_uses_currency_prefix(self):
        self.assertIn("MYR89,157.48", render.build_html(quote(), COMPANY, render.HERE))


class DateTest(unittest.TestCase):
    def test_expiry_defaults_to_one_month_later(self):
        self.assertIn("15-11-2026", render.build_html(quote(), COMPANY, render.HERE))

    def test_month_end_clamps(self):
        self.assertEqual(render.add_months(datetime.date(2026, 1, 31), 1), datetime.date(2026, 2, 28))
        self.assertEqual(render.add_months(datetime.date(2026, 12, 15), 1), datetime.date(2027, 1, 15))


class ValidationTest(unittest.TestCase):
    def test_rejects_text_quantity(self):
        bad = quote(items=[{"title": "Tile", "qty": "10", "unit": "sqft", "rate": 5}])
        with self.assertRaisesRegex(render.QuoteError, "qty must be a number"):
            render.build_html(bad, COMPANY, render.HERE)

    def test_rejects_wrong_date_format(self):
        with self.assertRaisesRegex(render.QuoteError, "estimateDate"):
            render.build_html(quote(estimateDate="2026-10-15"), COMPANY, render.HERE)

    def test_escapes_customer_text(self):
        page = render.build_html(quote(customer={"name": "A & B <Sdn Bhd>"}), COMPANY, render.HERE)
        self.assertIn("A &amp; B &lt;Sdn Bhd&gt;", page)


if __name__ == "__main__":
    unittest.main()
