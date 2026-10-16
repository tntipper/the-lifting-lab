"""Produce held catalogue drafts from captured evidence. No network or commerce writes.

Usage: python3 scripts/build-catalogue-drafts.py --comparison PATH --sources PATH
Both inputs are private review captures. Outputs are review documents, never import files.
"""
import argparse
import csv
import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/research/catalogue-drafts-2026-10-03'
CONFLICTS = {
    'OPT034': 'TLL lists 896g Chocolate; supplier name and barcode-matched brand option say 924g Chocolate Supreme. Supplier Size still says 896g.',
    'PER183': 'TLL and supplier list 900g Cherry Bakewell; barcode-matched brand option says 810G.',
    'SYN031': 'TLL and supplier name say Vanilla; barcode-matched brand option says Cookies & Cream / 750g.',
    'OPT296': 'TLL lists 775g; the current brand family lists 780g. No exact barcode match establishes a replacement.',
}
FORM = {
    'Casein': 'casein protein powder', 'Creatine': 'creatine product',
    'Cycle support': 'capsule product', 'EAA': 'amino acid product',
    'Gut & digestion': 'enzyme capsule product', 'Hormone support': 'capsule product',
    'Hydration': 'electrolyte product', 'Multivitamin': 'multivitamin product',
    'Post workout': 'powder product', 'Pre workout': 'pre-workout product',
    'Protein': 'protein powder', 'Protein bar': 'protein bar product',
    'Vitamins': 'supplement product', 'Whey isolate': 'whey isolate powder',
    'Whey protein': 'whey protein powder',
}
FIELDS = ['ingredients', 'allergens', 'directions', 'warnings', 'nutrition']


def write_csv(path, rows):
    assert rows
    with path.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def barcode(value):
    value = str(value or '').strip()
    return value if re.fullmatch(r'\d{8,14}', value) and int(value) > 0 else None


def money(value):
    return str(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def build(comparison, captures):
    rows = json.loads(comparison.read_text())['rows']
    sources = {r['handle']: r for r in json.loads(captures.read_text())}
    brands = list(csv.DictReader((ROOT / 'docs/research/2026-09-30-official-brand-products.csv').open()))
    by_sku = {sku.strip(): b['shopify_handle'] for b in brands for sku in b['tll_variant_skus'].split('|')}
    assert len(rows) == 74 and len(by_sku) == 74 and len(sources) == 63
    assert {r['sku'] for r in rows} == set(by_sku)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'products').mkdir(exist_ok=True)
    variants, products, images, prices = [], [], [], []
    for row in rows:
        handle = by_sku[row['sku']]
        source = sources[handle]
        code = barcode(row.get('feedBarcode'))
        matches = [v for v in source.get('manufacturerVariants', []) if code and barcode(v.get('barcode')) == code]
        conflict = CONFLICTS.get(row['sku'], '')
        status = ('CONFLICT_REQUIRES_RESOLUTION' if conflict else
                  'PACK_AND_FLAVOUR_NOT_SELECTED' if row['variant'] == 'Default Title' else
                  'OFFICIAL_SOURCE_UNAVAILABLE' if source['httpStatus'] != 200 else
                  'MULTIPLE_BARCODE_OPTIONS_HOLD' if len(matches) > 1 else
                  'BARCODE_CANDIDATE_LABEL_REVIEW_OPEN' if len(matches) == 1 else 'FAMILY_SOURCE_EXACT_VARIANT_OPEN')
        variants.append({
            'sku': row['sku'], 'handle': handle, 'product': row['product'], 'tll_variant': row['variant'],
            'shopify_status_observed_2026_10_02': row['status'],
            'supplier_stock_observed_unapproved': row.get('feedStock'), 'feed_match': row['feedStatus'],
            'supplier_barcode_observed_unapproved': code or '',
            'barcode_candidate_count': len(matches),
            'manufacturer_barcode_option_candidates': ' | '.join(str(v['title']) for v in matches),
            'identity_review': status, 'conflict': conflict,
            'existing_review_note': row.get('note', ''), 'source_url': source['sourceUrl'],
            'source_region': source['region'], 'retrieved_at_utc': source['retrievedAtUtc'],
            'ingredients': 'EXACT_LABEL_REVIEW_OPEN', 'allergens': 'EXACT_LABEL_REVIEW_OPEN',
            'directions': 'EXACT_LABEL_REVIEW_OPEN', 'warnings': 'EXACT_LABEL_REVIEW_OPEN',
            'nutrition': 'EXACT_LABEL_REVIEW_OPEN', 'commercial_approval': 'HOLD',
            'restock_action': 'Reuse existing variant only after fresh stock and all other approvals',
        })
        if row['price'] > 0 and row.get('wholesale') is not None:
            price, cost = Decimal(str(row['price'])), Decimal(str(row['wholesale']))
            rate = Decimal(str(row.get('vatRate') or 0))
            # Conservative cash illustration for TLL's recorded non-VAT-registered policy.
            # No output-VAT deduction or input-VAT recovery. Fees/reserves remain unknown.
            ex_basis_cost, inc_basis_cost = cost * (1 + rate), cost
            prices.append({
                'sku': row['sku'], 'product': row['product'], 'variant': row['variant'],
                'listed_selling_price_gbp': money(price), 'historical_supplier_quote_gbp': money(cost),
                'supplier_csv_quote_observed_gbp': row.get('feedPrice'),
                'assumed_supplier_vat_rate_unapproved': str(rate),
                'cash_left_if_quote_ex_vat_before_delivery_fees_returns_gbp': money(price - ex_basis_cost),
                'cash_left_if_quote_inc_vat_before_delivery_fees_returns_gbp': money(price - inc_basis_cost),
                'cash_left_if_quote_ex_vat_and_tll_absorbs_one_6gbp_delivery_gbp': money(price - ex_basis_cost - 6),
                'cash_left_if_quote_inc_vat_and_tll_absorbs_one_6gbp_delivery_gbp': money(price - inc_basis_cost - 6),
                'basis': 'TLL non-VAT-registered cash illustration; customer shipping receipts excluded',
                'release_status': 'HOLD: VAT basis, exact unit, payment fees, returns reserve and approved stock needed',
                'approved_price_recommendation_gbp': '',
            })
    for brand in brands:
        handle = brand['shopify_handle']
        source = sources[handle]
        members = [v for v in variants if v['handle'] == handle]
        original = next(r for r in rows if by_sku[r['sku']] == handle)
        title = original['product']
        draft = f'{title} is a {FORM[original["category"]]}. Compare the pack options and read the label details before choosing your product.'
        page = [f'# {title} — draft review', '',
                '**DRAFT / NOT APPROVED FOR PUBLICATION.** Product identity, exact label and commerce checks remain open.', '',
                f'Proposed title: {title}', '', f'Proposed short description: {draft}', '',
                'This original draft uses the existing catalogue classification only. It makes no efficacy, dosage, dietary or safety claim. Size, flavour, serving count and health claims must be checked before publication.', '',
                f'Official source: [{source.get("manufacturerTitle") or source.get("pageTitle") or "Unresolved product page"}]({source["sourceUrl"]})', '',
                f'Checked at {source["retrievedAtUtc"]}; region: {source["region"]}; HTTP response: {source["httpStatus"]}.', '',
                f'Captured HTML SHA-256: `{source.get("htmlSha256", "not captured")}`.', '',
                '## Variant review', '', '| SKU | Existing size / flavour | Supplier stock observation | Identity review |', '| --- | --- | --- | --- |']
        for member in members:
            stock = member['supplier_stock_observed_unapproved']
            page.append(f'| {member["sku"]} | {member["tll_variant"]} | {stock if stock is not None else "Missing"} | {member["identity_review"]} |')
        page.extend(['', 'Supplier counts are unapproved observations. No stock claim, backorder or restock date is authorised.', '', '## Details to verify', ''])
        for member in members:
            if member['conflict'] or member['existing_review_note']:
                page.extend([f'- {member["sku"]}: {member["conflict"] or member["existing_review_note"]}'])
        if source.get('priorSource'):
            page.extend(['', f'Earlier source: {source["priorSource"]["sourceUrl"]}. The replacement is a research candidate; current family/version must still be bound to our exact item.'])
        page.extend(['', '## Label research leads', '',
                     'These short search extracts help locate details on the captured page. They may refer to another option or page navigation. A mention is not an approved ingredient, allergen, instruction, warning or nutrition record; absence does not mean no allergens or warnings.', ''])
        sections = source.get('candidateSections', {})
        for field in FIELDS:
            candidate = sections.get(field, [])
            excerpt = ' '.join(candidate[0].split()[:18]) if candidate else ''
            page.extend([f'- {field.capitalize()}: ' + (f'page-text lead “{excerpt}…”; exact label review open.' if excerpt else 'no usable text lead captured; exact label required.')])
        page.extend(['', '## Images', '', 'Official image links are reference candidates. Exact packaging and permission to reuse must be confirmed. No images were downloaded or published.', ''])
        for image_index, reference in enumerate(source.get('imageReferences', []), start=1):
            image = urljoin(source['sourceUrl'], reference)
            images.append({'handle': handle, 'source_url': source['sourceUrl'], 'image_reference': image,
                           'exact_packaging': 'UNVERIFIED', 'reuse_permission': 'UNCONFIRMED'})
            page.append(f'- [Image candidate {image_index}]({image})')
        page.extend(['', '## Availability and purchase copy', '',
                     '- Approved zero stock: “Out of stock” / “Currently unavailable to buy”.',
                     '- Unresolved stock or identity: “Availability under review”.',
                     '- Fresh approved positive stock: retain the existing item; purchasing stays disabled until the release is authorised.',
                     '- No promised restock date. No unreviewed dosage, label or image publication.', ''])
        (OUT / 'products' / (handle + '.md')).write_text('\n'.join(page))
        products.append({'handle': handle, 'product': title, 'variant_count': len(members),
                         'draft_file': 'products/' + handle + '.md', 'source_url': source['sourceUrl'],
                         'source_http_status': source['httpStatus'], 'source_title': source.get('manufacturerTitle') or source.get('pageTitle') or '',
                         'source_region': source['region'], 'retrieved_at_utc': source['retrievedAtUtc'],
                         'candidate_image_count': len(source.get('imageReferences', [])),
                         'copy_status': 'DRAFT_EXACT_IDENTITY_AND_LABEL_REVIEW_OPEN',
                         'zero_stock_variant_count': sum(v['supplier_stock_observed_unapproved'] == 0 for v in members)})
    write_csv(OUT / 'products.csv', products)
    write_csv(OUT / 'variants.csv', variants)
    write_csv(OUT / 'image-references.csv', images)
    write_csv(OUT / 'price-review.csv', prices)
    summary = {'products': len(products), 'variants': len(variants),
               'official_pages_http200': sum(p['source_http_status'] == 200 for p in products),
               'structured_manufacturer_pages': sum('manufacturerVariants' in s for s in sources.values()),
               'variants_with_one_barcode_candidate': sum(v['barcode_candidate_count'] == 1 for v in variants),
               'zero_stock_variants': sum(v['supplier_stock_observed_unapproved'] == 0 for v in variants),
               'price_scenarios': len(prices), 'image_references': len(images),
               'approved_label_records': 0, 'approved_price_changes': 0}
    assert len(products) == 63 and len(variants) == 74 and len(prices) == 61
    assert summary['zero_stock_variants'] == 10
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comparison', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    args = parser.parse_args()
    build(args.comparison, args.sources)
