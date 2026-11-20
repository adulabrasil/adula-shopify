"""Classify existing URL audit against a public catalog snapshot; never infer discontinued from 404.

Usage: python scripts/classify-legacy-product-urls.py AUDIT.csv PRODUCTS.json OUTPUT_DIR
No network or catalog mutations. PRODUCTS.json is the paginated Shopify /products.json list.
"""
import collections
import csv
import datetime
import difflib
import json
import pathlib
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit


def key(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', unquote(value)).encode('ascii', 'ignore').decode().lower())


def classify(rows, products):
    by_handle = {p['handle']: p for p in products}
    compact = collections.defaultdict(list)
    for p in products:
        compact[key(p['handle'])].append(p)
    results = []
    for row in rows:
        source = row['URL antiga']
        destination = row.get('301 proposto') or urlsplit(row.get('Destino existente', '')).path
        handle = destination.removeprefix('/products/').strip('/') if destination.startswith('/products/') else ''
        product = by_handle.get(handle)
        evidence = 'Destino existente/proposto corresponde a produto no catálogo público' if product else ''
        if not product:
            slug = source.rstrip('/').rsplit('/', 1)[-1]
            matches = compact[key(slug)]
            if len(matches) == 1:
                product = matches[0]
                evidence = 'Slug único igual após normalizar acentos/hífens; revisar equivalência comercial'
        suggestion = ''
        if product:
            classification = 'PRODUTO_PUBLICADO_OBSERVADO'
            target = '/products/' + product['handle']
        elif destination.startswith(('/collections/', '/pages/', '/policies/', '/blogs/')) or source == '/':
            classification = 'CONTEUDO_OU_CATEGORIA'
            target = destination
        else:
            classification = 'SEM_EQUIVALENCIA_CONFIRMADA'
            target = ''
            candidates = difflib.get_close_matches(key(source.rsplit('/', 1)[-1]), list(compact), n=1, cutoff=.82)
            if candidates and len(compact[candidates[0]]) == 1:
                suggestion = '/products/' + compact[candidates[0]][0]['handle']
            evidence = '404/ausência no catálogo público NÃO comprova descontinuação; conferir Admin, Bagy/exportação e decisão comercial'
        results.append({'url_antiga': source, 'classe': classification, 'produto_id': product['id'] if product else '',
                        'produto': product['title'] if product else '', 'destino_identificado': target,
                        'sugestao_nao_aprovada': suggestion, 'evidencia': evidence,
                        'status_admin': 'NAO_CONFERIDO', 'descontinuado': 'NAO_CONFIRMADO',
                        'http_auditoria_anterior': row.get('HTTP final', '')})
    return results


if __name__ == '__main__':
    source, catalog, output = sys.argv[1:]
    products = json.loads(pathlib.Path(catalog).read_text())
    with open(source, encoding='utf-8-sig', newline='') as stream:
        results = classify(list(csv.DictReader(stream)), products)
    output = pathlib.Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for name, selected in [('urls-antigas-classificadas.csv', results),
                           ('produtos-publicados-com-url-antiga.csv', [r for r in results if r['classe'] == 'PRODUTO_PUBLICADO_OBSERVADO']),
                           ('urls-para-decisao-comercial.csv', [r for r in results if r['classe'] == 'SEM_EQUIVALENCIA_CONFIRMADA'])]:
        with (output / name).open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(results[0]), lineterminator="\n")
            writer.writeheader()
            writer.writerows(selected)
    with (output / 'catalogo-publico-observado.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(['produto_id', 'handle', 'titulo', 'published_at_publico', 'variantes', 'variantes_disponiveis', 'status_admin', 'outros_canais'])
        writer.writerows((p['id'], p['handle'], p['title'], p.get('published_at'), len(p['variants']), sum(v.get('available', False) for v in p['variants']), 'NAO_CONFERIDO', 'NAO_CONFERIDOS') for p in products)
    summary = {'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'public_products': len(products),
               'old_urls': len(results), 'counts': dict(collections.Counter(r['classe'] for r in results)),
               'discontinued_confirmed': 0, 'admin_verified': False,
               'warning': 'Public visibility is not administrative ACTIVE status. No 301 import or catalog change. Unknown URLs require business evidence.'}
    (output / 'classificacao-resumo.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
