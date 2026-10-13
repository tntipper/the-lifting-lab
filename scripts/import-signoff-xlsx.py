"""Read-only XLSX bridge using Python's standard library; never evaluates formulas."""
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def read_workbook(path, sheet_name):
    with zipfile.ZipFile(path) as book:
        strings = []
        if 'xl/sharedStrings.xml' in book.namelist():
            strings = [''.join(t.text or '' for t in item.findall('.//s:t', NS))
                       for item in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        sheets = ET.fromstring(book.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS)
        sheet = next((s for s in sheets if s.get('name') == sheet_name), None)
        if sheet is None:
            raise ValueError('Missing worksheet')
        relationships = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in relationships if r.get('Id') == sheet.get(REL))
        target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        records = []
        headers = None
        for row in ET.fromstring(book.read(target)).findall('s:sheetData/s:row', NS):
            values = {}
            formulas = set()
            for cell in row.findall('s:c', NS):
                column = ''.join(c for c in cell.get('r') if c.isalpha())
                if column in values:
                    raise ValueError('Duplicate cell')
                value = cell.findtext('s:v', '', NS)
                if cell.get('t') == 's':
                    value = strings[int(value)]
                elif cell.get('t') == 'inlineStr':
                    value = ''.join(t.text or '' for t in cell.findall('s:is//s:t', NS))
                if cell.find('s:f', NS) is not None:
                    formulas.add(column)
                    value = ''  # Cached formula values are not authoritative input.
                if cell.get('t') == 'e':
                    value = ''
                values[column] = value
            if headers is None:
                if 'toby_signoff' not in values.values():
                    continue
                headers = {k: v.strip() for k, v in values.items() if v.strip()}
                if len(set(headers.values())) != len(headers):
                    raise ValueError('Duplicate headers')
                continue
            if any(values.values()) or formulas:
                records.append({'row': int(row.get('r')), 'cells': {v: values.get(k, '') for k, v in headers.items()},
                                'formulaFields': [headers[k] for k in formulas if k in headers]})
        if headers is None:
            raise ValueError('Missing toby_signoff header')
        return records


if __name__ == '__main__':
    try:
        print(json.dumps(read_workbook(sys.argv[1], sys.argv[2])))
    except Exception:
        print('XLSX read failed: unreadable workbook, worksheet or headers.', file=sys.stderr)
        sys.exit(1)
