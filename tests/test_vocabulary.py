import json
import unittest
from pathlib import Path

from tools.extract_vocabulary import extract, normalize_heading


ROOT = Path(__file__).resolve().parents[1]


class VocabularyDataTests(unittest.TestCase):
    @unittest.skipUnless((ROOT / "Saadan_ordliste.pdf").exists(), "source PDF is not included")
    def test_pdf_extracts_categorized_entries_and_noun_gender(self):
        categories, page_count, unpaired = extract(ROOT / "Saadan_ordliste.pdf")

        self.assertEqual(page_count, 50)
        self.assertGreater(unpaired, 0)
        self.assertEqual(categories["substantiver"][0]["danish"], "adgang")
        self.assertEqual(categories["substantiver"][0]["english"], "access")
        self.assertEqual(categories["substantiver"][0]["gender"], "en")
        self.assertGreater(sum(map(len, categories.values())), 1000)
        self.assertTrue(all(categories[name] for name in ("verber", "adjektiver", "adverbier")))

    def test_checked_in_json_has_unique_ids_and_danish_characters(self):
        data = json.loads((ROOT / "data" / "vocabulary.json").read_text(encoding="utf-8"))
        entries = [entry for group in data["categories"].values() for entry in group]

        self.assertGreater(len(entries), 1000)
        self.assertEqual(len(entries), len({entry["id"] for entry in entries}))
        self.assertTrue(any("æ" in entry["danish"] or "ø" in entry["danish"] or "å" in entry["danish"] for entry in entries))
        self.assertFalse(any("\ufffd" in entry["danish"] or "\ufffd" in entry["english"] for entry in entries))

    def test_heading_normalization_handles_danish_letters(self):
        self.assertEqual(normalize_heading("PRÆPOSITIONER"), "PRAEPOSITIONER")
        self.assertEqual(normalize_heading("SPØRGENDE HV- ORD"), "SPORGENDE HV- ORD")


if __name__ == "__main__":
    unittest.main()
