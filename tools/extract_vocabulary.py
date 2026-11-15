import json
import re
import sys
import unicodedata
import zlib
from pathlib import Path


SECTION_KEYS = {
    "SUBSTANTIVER": "substantiver",
    "VERBER": "verber",
    "PRONOMENER": "pronomener",
    "FORMELT SUBJEKT": "formelt_subjekt",
    "SPORGENDE HV- ORD": "sporgende_hv_ord",
    "ADVERBIER & ADVERBIALER": "adverbier",
    "ADJEKTIVER": "adjektiver",
    "PRAEPOSITIONER": "praepositioner",
    "KONJUNKTIONER": "konjunktioner",
    "INTERJEKTIONER": "interjektioner",
    "VERBUMSUDTRYK": "verbumsudtryk",
    "ANDRE ORD & UDTRYK": "andre_udtryk",
}


def decode_stream(obj):
    match = re.search(rb"stream\r?\n(.*?)\r?\nendstream", obj, re.S)
    if not match:
        return b""
    content = match.group(1)
    if b"FlateDecode" in obj[: match.start()]:
        try:
            return zlib.decompress(content)
        except zlib.error as error:
            raise ValueError("A compressed PDF stream could not be decoded.") from error
    return content


def decode_literal(value):
    result = bytearray()
    index = 0
    while index < len(value):
        if value[index] != 92:
            result.append(value[index])
            index += 1
            continue
        index += 1
        if index >= len(value):
            break
        if 48 <= value[index] <= 55:
            match = re.match(rb"[0-7]{1,3}", value[index:])
            result.append(int(match.group(), 8))
            index += len(match.group())
        else:
            char = value[index]
            result.append({ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}.get(char, char))
            index += 1
    return bytes(result)


def normalize_heading(text):
    text = unicodedata.normalize("NFKD", text.upper())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.translate(str.maketrans({"Æ": "AE", "Ø": "O", "Å": "A"}))
    return re.sub(r"\s+", " ", text).strip()


def parse_text_rows(content):
    rows = {}
    text_blocks = re.findall(rb"BT(.*?)ET", content, re.S)
    token_pattern = re.compile(
        rb"/[A-Za-z0-9]+\s+[\d.]+\s+Tf|"
        rb"[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm|"
        rb"\(((?:\\.|[^\\)])*)\)\s*Tj|"
        rb"\[([^\]]*)\]\s*TJ|"
        rb"<([0-9A-Fa-f]+)>\s*Tj",
        re.S,
    )
    for block in text_blocks:
        x = y = 0
        for token in token_pattern.finditer(block):
            if token.group(1):
                x, y = round(float(token.group(1))), round(float(token.group(2)))
                continue
            if token.group(3):
                value = decode_literal(token.group(3))
            elif token.group(4):
                chunks = re.findall(rb"\(((?:\\.|[^\\)])*)\)", token.group(4))
                value = b"".join(decode_literal(chunk) for chunk in chunks)
            elif token.group(5):
                value = bytes.fromhex(token.group(5).decode("ascii"))
            else:
                continue
            text = value.decode("cp1252", errors="replace").replace("\x00", "").strip()
            if not text or not any(char.isalnum() for char in text):
                continue
            rows.setdefault((x, y), []).append(text)
    return sorted(
        ((x, y, "".join(parts)) for (x, y), parts in rows.items()),
        key=lambda row: (-row[1], row[0]),
    )


def clean_entry(text, category):
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text).strip()
    gender = None
    if category == "substantiver":
        match = re.match(r"^\(?\s*(en|et)\)?\s+", text, re.I)
        if match:
            gender = match.group(1).lower()
            text = text[match.end() :]
        elif not text.lower().startswith("(et par) "):
            return None, None
    lemma = text.split("/", 1)[0].strip(" \t-")
    if not lemma or not any(char.isalpha() for char in lemma):
        return None, None
    return lemma, gender


def extract(pdf_path):
    raw = pdf_path.read_bytes()
    objects = {
        int(match.group(1)): match.group(2)
        for match in re.finditer(rb"(\d+)\s+\d+\s+obj\s*(.*?)\s*endobj", raw, re.S)
    }
    pages = [obj for obj in objects.values() if re.search(rb"/Type/Page\b", obj)]
    categories = {key: [] for key in SECTION_KEYS.values()}
    section = None
    unpaired = 0
    for page_number, page in enumerate(pages, start=1):
        content_ref = re.search(rb"/Contents\s+(\d+)", page)
        if not content_ref:
            continue
        content = decode_stream(objects[int(content_ref.group(1))])
        rows = parse_text_rows(content)
        by_y = {}
        for x, y, text in rows:
            by_y.setdefault(y, {"left": [], "right": []})["left" if x < 280 else "right"].append((x, text))
        for y in sorted(by_y, reverse=True):
            cells = by_y[y]
            left = " ".join(
                text
                for _, text in sorted(cells["left"])
                if not re.fullmatch(r"[\s.]+", text)
            )
            heading = SECTION_KEYS.get(normalize_heading(left))
            if heading:
                if page_number == 2 and y > 560:
                    continue
                section = heading
                continue
            if section is None or (page_number == 2 and y > 560):
                continue
            if not left or left.startswith(".") or left.upper() in ("ORDLISTE", "GLOSSARY"):
                continue
            danish, gender = clean_entry(left, section)
            if not danish:
                continue
            english = " ".join(
                text
                for _, text in sorted(cells["right"])
                if not re.fullmatch(r"[\s.]+", text)
            ).strip()
            if not english or english.startswith("."):
                unpaired += 1
                continue
            entries = categories[section]
            entries.append(
                {
                    "id": f"{section}-{len(entries) + 1}",
                    "danish": danish,
                    "english": english,
                    "gender": gender,
                    "difficulty": 2,
                    "audio": None,
                    "source": pdf_path.name,
                }
            )
    return categories, len(pages), unpaired


def main():
    root = Path(__file__).resolve().parents[1]
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "Saadan_ordliste.pdf"
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "data" / "vocabulary.json"
    if not source.is_file():
        raise FileNotFoundError(f"PDF not found: {source}")
    categories, page_count, unpaired = extract(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "source": source.name,
                "extractedAt": "generated locally",
                "categories": categories,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Read {page_count} pages from {source.name}.")
    print(f"Wrote {sum(map(len, categories.values()))} translated entries to {output}.")
    print(f"Skipped {unpaired} entries without a same-row English translation.")
    for name, entries in categories.items():
        print(f"{name}: {len(entries)}")


if __name__ == "__main__":
    main()
