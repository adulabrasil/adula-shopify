import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[2] / 'scripts/classify-legacy-product-urls.py'
spec = importlib.util.spec_from_file_location('classify', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LegacyURLs(unittest.TestCase):
    def test_matches_are_evidence_not_admin_status(self):
        products = [{'id': 1, 'handle': 'anel-rosa', 'title': 'Anel Rosa'}]
        rows = [{'URL antiga': '/anel-rosa', 'HTTP final': '404'},
                {'URL antiga': '/old-ring', 'Destino existente': 'https://example.invalid/products/anel-rosa'},
                {'URL antiga': '/peca-retirada', 'HTTP final': '404'},
                {'URL antiga': '/aneis', '301 proposto': '/collections/aneis'}]
        result = module.classify(rows, products)
        self.assertEqual([r['classe'] for r in result], ['PRODUTO_PUBLICADO_OBSERVADO', 'PRODUTO_PUBLICADO_OBSERVADO', 'SEM_EQUIVALENCIA_CONFIRMADA', 'CONTEUDO_OU_CATEGORIA'])
        self.assertTrue(all(r['descontinuado'] == 'NAO_CONFIRMADO' and r['status_admin'] == 'NAO_CONFERIDO' for r in result))

    def test_ambiguous_normalized_slug_is_not_accepted(self):
        products = [{'id': i, 'handle': handle, 'title': handle} for i, handle in enumerate(['anel-a', 'anela'])]
        result = module.classify([{'URL antiga': '/anel--a', 'HTTP final': '404'}], products)
        self.assertEqual(result[0]['classe'], 'SEM_EQUIVALENCIA_CONFIRMADA')


if __name__ == '__main__':
    unittest.main()
