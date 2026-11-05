"""Render a GQ Projects quotation PDF from a quote JSON file.

Usage: /usr/bin/python3 render.py <quote.json> [output.pdf]
Standard library only, so it runs on any Mac without installs.
"""
import base64
import calendar
import datetime
import html
import json
import mimetypes
import os
import string
import subprocess
import sys
import tempfile
from decimal import ROUND_HALF_UP, Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
BROWSERS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]
CENT = Decimal("0.01")


class QuoteError(ValueError):
    pass


def money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def fmt(amount):
    return "{:,.2f}".format(amount)


def line_amount(item):
    """Amount is qty x rate rounded half-up to the cent, as the accounting system does."""
    return money(Decimal(str(item["qty"])) * Decimal(str(item["rate"])))


def quote_total(items):
    return sum((line_amount(i) for i in items), Decimal("0.00"))


def add_months(day, months):
    month_index = day.month - 1 + months
    year, month = day.year + month_index // 12, month_index % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def parse_date(text, field):
    try:
        return datetime.datetime.strptime(text, "%d-%m-%Y").date()
    except (TypeError, ValueError):
        raise QuoteError("{} must be a date like 15-10-2026, got {!r}".format(field, text))


def validate(quote):
    for field in ("number", "estimateDate", "project", "salesperson", "customer", "items"):
        if not quote.get(field):
            raise QuoteError("missing {}".format(field))
    if not quote["customer"].get("name"):
        raise QuoteError("missing customer.name")
    for n, item in enumerate(quote["items"], 1):
        for field in ("title", "qty", "unit", "rate"):
            if item.get(field) in (None, ""):
                raise QuoteError("item {} is missing {}".format(n, field))
        for field in ("qty", "rate"):
            if not isinstance(item[field], (int, float)) or isinstance(item[field], bool):
                raise QuoteError("item {} {} must be a number".format(n, field))


def lines_html(lines):
    """Each string is a line; an empty string leaves a gap like the example's blank lines."""
    return "<br>".join(html.escape(line) if line else "" for line in lines)


def image_src(path, base_dir):
    full = path if os.path.isabs(path) else os.path.join(base_dir, path)
    if not os.path.isfile(full):
        raise QuoteError("image not found: {}".format(full))
    kind = mimetypes.guess_type(full)[0] or "image/jpeg"
    with open(full, "rb") as handle:
        return "data:{};base64,{}".format(kind, base64.b64encode(handle.read()).decode())


def item_row(n, item, base_dir):
    photo = ""
    if item.get("image"):
        photo = '<img src="{}" alt="">'.format(image_src(item["image"], base_dir))
    product = '<div class="name">{}</div><div class="lines">{}</div>'.format(
        html.escape(item["title"]), lines_html(item.get("lines", []))
    )
    return (
        '<tr><td>{n}</td><td class="photo">{photo}</td><td class="product">{product}</td>'
        '<td class="r">{qty}<br><span class="unit">{unit}</span></td>'
        '<td class="r">{rate}</td><td class="r">{amount}</td></tr>'
    ).format(
        n=n, photo=photo, product=product, qty=fmt(money(item["qty"])), unit=html.escape(item["unit"]),
        rate=fmt(money(item["rate"])), amount=fmt(line_amount(item)),
    )


def notes_html(company, quote):
    blocks = []
    if quote.get("notes"):
        blocks.append(lines_html(quote["notes"]))
    blocks.append("Lead time:<br>" + lines_html(quote.get("leadTime", company["leadTime"])))
    blocks.append("Payment term--<br>" + lines_html(quote.get("paymentTerms", company["paymentTerms"])))
    blocks.append("({})".format(html.escape(company["bank"])))
    blocks.append("Contact person:<br>" + html.escape(quote.get("contact", company["contact"])))
    return "".join("<p>{}</p>".format(b) for b in blocks)


def terms_html(terms):
    return "".join(
        "<p>{}. {}<br>{}</p>".format(n, html.escape(title), html.escape(body).replace("\n", "<br>"))
        for n, (title, body) in enumerate(terms, 1)
    )


def build_html(quote, company, base_dir):
    validate(quote)
    estimate = parse_date(quote["estimateDate"], "estimateDate")
    expiry = (
        parse_date(quote["expiryDate"], "expiryDate") if quote.get("expiryDate")
        else add_months(estimate, company["validMonths"])
    )
    customer = quote["customer"]
    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as handle:
        template = string.Template(handle.read())
    return template.substitute(
        number=html.escape(quote["number"]),
        logo=image_src(os.path.join(HERE, "logo.jpg"), HERE),
        companyName=html.escape(company["name"]),
        registration=html.escape(company["registration"]),
        companyAddress=lines_html(company["address"]),
        phone=html.escape(company["phone"]),
        website=html.escape(company["website"]),
        customerName=html.escape(customer["name"]),
        customerAddress=lines_html(customer.get("address", []) + [customer.get("phone", "")]),
        estimateDate=estimate.strftime("%d-%m-%Y"),
        expiryDate=expiry.strftime("%d-%m-%Y"),
        project=html.escape(quote["project"]),
        salesperson=html.escape(quote["salesperson"]),
        rows="".join(item_row(n, item, base_dir) for n, item in enumerate(quote["items"], 1)),
        total=company["currency"] + fmt(quote_total(quote["items"])),
        notes=notes_html(company, quote),
        terms=terms_html(quote.get("terms", company["terms"])),
    )


def find_browser():
    for path in BROWSERS:
        if os.path.isfile(path):
            return path
    return None


def main(argv):
    if len(argv) not in (2, 3):
        sys.exit("usage: render.py <quote.json> [output.pdf]")
    quote_path = os.path.abspath(argv[1])
    with open(quote_path, encoding="utf-8") as handle:
        quote = json.load(handle)
    with open(os.path.join(HERE, "company.json"), encoding="utf-8") as handle:
        company = json.load(handle)
    try:
        page = build_html(quote, company, os.path.dirname(quote_path))
    except QuoteError as error:
        sys.exit("quote problem: {}".format(error))
    default_name = "{} {}.pdf".format(quote["number"], quote["project"]).replace("/", "-")
    out = os.path.abspath(argv[2]) if len(argv) == 3 else os.path.join(os.path.dirname(quote_path), default_name)
    html_path = os.path.splitext(out)[0] + ".html"
    browser = find_browser()
    with tempfile.TemporaryDirectory() as tmp:
        page_path = os.path.join(tmp, "quotation.html")
        with open(page_path, "w", encoding="utf-8") as handle:
            handle.write(page)
        if browser is None:
            with open(html_path, "w", encoding="utf-8") as handle:
                handle.write(page)
            print("NO_BROWSER {}".format(html_path))
            return
        subprocess.run(
            [browser, "--headless", "--disable-gpu", "--no-pdf-header-footer",
             "--user-data-dir=" + os.path.join(tmp, "profile"), "--print-to-pdf=" + out, "file://" + page_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120,
        )
    print("PDF {}".format(out))


if __name__ == "__main__":
    main(sys.argv)
