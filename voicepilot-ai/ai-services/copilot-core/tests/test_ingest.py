"""Ingestion: keep the shape, and refuse what would leave the copilot mute."""

from __future__ import annotations

import io
import unittest
import zipfile

from copilot import Index, Scope
from ingest import (
    MIN_WORDS_PER_DOC,
    Extracted,
    PublicationRefused,
    Unsupported,
    extract,
    from_csv,
    from_docx,
    from_html,
    from_text,
    inspect,
    publish,
)

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def docx(paragraphs: list[tuple[str, str]]) -> bytes:
    """Build a real .docx. `paragraphs` is (style, text) — style "" is body."""
    def para(style: str, text: str) -> str:
        props = '<w:pPr><w:pStyle w:val="%s"/></w:pPr>' % style if style else ""
        return "<w:p>%s<w:r><w:t>%s</w:t></w:r></w:p>" % (props, text)

    body = "".join(para(s, t) for s, t in paragraphs)
    xml = f'<?xml version="1.0"?><w:document xmlns:w="{W}"><w:body>{body}</w:body></w:document>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


# Long enough to clear MIN_WORDS_PER_KB, varied enough not to look like the
# header dump the repetition check is watching for.
LONG = "\n\n".join(
    f"Parrafo {i}: " + " ".join(f"palabra{i}x{j}" for j in range(18))
    for i in range(1, 21)
)


class Docx(unittest.TestCase):
    def test_heading_levels_survive_extraction(self):
        """If the hierarchy dies here, chunking cannot rebuild it and every
        downstream guarantee is built on rubble."""
        out = from_docx(docx([
            ("Heading1", "Manual de objeciones"),
            ("Heading2", "5.3 Es muy caro"),
            ("", "Respuesta primaria: se divide en 24 meses."),
        ]))
        self.assertIn("# Manual de objeciones", out.text)
        self.assertIn("## 5.3 Es muy caro", out.text)

    def test_the_four_ways_word_writes_a_heading_all_count(self):
        # Word emits Heading1, "Heading 1", "heading 1", and Ttulo1 in
        # documents translated from Spanish. Recognising one silently
        # flattens the other three.
        for style in ("Heading1", "Heading 1", "heading 1", "Ttulo1"):
            out = from_docx(docx([(style, "Seccion"), ("", LONG)]))
            self.assertIn("# Seccion", out.text, style)

    def test_a_flat_document_warns_instead_of_pretending(self):
        out = from_docx(docx([("", LONG)]))
        self.assertTrue(any("no heading" in w for w in out.warnings))

    def test_a_file_that_is_not_a_docx_is_refused_not_emptied(self):
        # "" looks exactly like a successfully-read empty document.
        with self.assertRaises(Unsupported):
            from_docx(b"this is not a zip")

    def test_extraction_feeds_chunking_end_to_end(self):
        out = from_docx(docx([
            ("Heading1", "Manual"),
            ("Heading2", "5.3 Es muy caro"),
            ("", "Se divide en 24 meses sin interes."),
            ("Heading2", "5.4 Lo tengo que pensar"),
            ("", "Ofrece enviar la propuesta hoy."),
        ]))
        pub = publish({"m.docx": Extracted(out.text + "\n\n" + LONG, "m.docx", "docx")},
                      tenant_id="t", kb_id="kb", current_version=0)
        labels = [c.heading_label for c in pub.chunks]
        self.assertTrue(any("5.3" in l for l in labels))
        self.assertFalse(any("5.3" in l and "5.4" in l for l in labels))


class Html(unittest.TestCase):
    def test_navigation_and_footers_are_discarded(self):
        """Nav text appears on every page of a corpus, which makes it look
        important to a term-frequency model. An agent handling a price
        objection does not need 'Skip to main content'."""
        out = from_html(
            "<nav>Inicio Productos Contacto</nav><h1>Garantias</h1>"
            "<p>Los paneles tienen 25 anos.</p><footer>(c) 2026 Acme</footer>"
        )
        self.assertIn("# Garantias", out.text)
        self.assertNotIn("Contacto", out.text)
        self.assertNotIn("Acme", out.text)

    def test_scripts_and_styles_never_reach_the_corpus(self):
        out = from_html("<style>.a{color:red}</style><h1>T</h1><script>x=1</script><p>Texto</p>")
        self.assertNotIn("color", out.text)
        self.assertNotIn("x=1", out.text)


class Csv(unittest.TestCase):
    def test_a_row_stays_one_record(self):
        """A retriever asked what SKU-4471 costs has to see that the part
        number and the price belong to the same row."""
        out = from_csv("sku,nombre,precio\nSKU-4471,Panel 400W,$389\nSKU-9000,Inversor,$1200")
        self.assertIn("## SKU-4471", out.text)
        block = out.text.split("## SKU-9000")[0]
        self.assertIn("$389", block)
        self.assertNotIn("$1200", block)

    def test_a_header_only_file_says_so(self):
        self.assertTrue(from_csv("a,b,c").warnings)


class Dispatch(unittest.TestCase):
    def test_pdf_refuses_and_explains_why_a_parser_would_not_help(self):
        with self.assertRaises(Unsupported) as cm:
            extract(b"%PDF-1.4", source="manual.pdf")
        self.assertIn("scan", str(cm.exception))

    def test_an_unknown_extension_is_refused_not_read_as_text(self):
        # Reading an .xlsx as text puts container fragments in the corpus,
        # and the copilot will one day quote them to a customer.
        with self.assertRaises(Unsupported):
            extract(b"PK\x03\x04", source="precios.xlsx")

    def test_text_without_structure_warns(self):
        self.assertTrue(from_text("solo un parrafo suelto sin nada mas").warnings)


class TheGate(unittest.TestCase):
    """The failure that is silent, slow and fatal."""

    def test_a_scanned_manual_is_rejected_at_upload(self):
        scan = Extracted("", "manual.pdf", "pdf")
        self.assertIsNotNone(inspect(scan))
        self.assertIn("scanned", inspect(scan))

    def test_a_header_footer_dump_is_recognised(self):
        # What a converter produces when it finds no body text.
        dump = Extracted(("Acme Corp - Confidencial\n" * 40) + LONG, "m.pdf", "pdf")
        self.assertIn("identical", inspect(dump) or "")

    def test_a_real_document_passes(self):
        self.assertIsNone(inspect(Extracted("# T\n\n" + LONG, "m.docx", "docx")))

    def test_publishing_only_bad_documents_refuses_loudly(self):
        with self.assertRaises(PublicationRefused) as cm:
            publish({"scan.pdf": Extracted("", "scan.pdf", "pdf")},
                    tenant_id="t", kb_id="kb", current_version=3)
        self.assertIn("scan.pdf", str(cm.exception))

    def test_a_corpus_too_small_to_answer_anything_is_refused(self):
        tiny = Extracted("# T\n\n" + " ".join(["x"] * 60), "t.md", "text")
        with self.assertRaises(PublicationRefused) as cm:
            publish({"t.md": tiny}, tenant_id="t", kb_id="kb", current_version=0)
        self.assertIn("silent", str(cm.exception))

    def test_one_bad_file_does_not_sink_the_good_ones(self):
        # Making somebody re-upload thirty files to fix one turns a
        # five-minute onboarding into an afternoon.
        pub = publish(
            {
                "good.md": Extracted("# Manual\n\n" + LONG + "\n\n" + LONG, "good.md", "text"),
                "scan.pdf": Extracted("", "scan.pdf", "pdf"),
            },
            tenant_id="t", kb_id="kb", current_version=0,
        )
        self.assertEqual(pub.accepted, ["good.md"])
        self.assertEqual(len(pub.rejected), 1)
        self.assertIn("REJECTED", pub.summary())


class Versioning(unittest.TestCase):
    """docs/06 §2 calls this non-negotiable for compliance."""

    DOC = Extracted("# Manual de objeciones\n\n" + LONG + "\n\n" + LONG, "m.md", "text")

    def test_publishing_increments_and_never_overwrites(self):
        v4 = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=3)
        self.assertEqual(v4.kb_version, 4)
        self.assertTrue(all(c.kb_version == 4 for c in v4.chunks))

    def test_a_march_call_still_resolves_after_a_december_publish(self):
        v3 = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=2)
        v4 = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=3)

        index = Index()
        index.add(v3.chunks)
        index.add(v4.chunks)
        # The old version is still queryable, and the new one does not answer
        # for it — an audit trail that only reaches the latest material is a
        # trail to nowhere.
        old = index.search("manual de objeciones", Scope("t", "kb", 3))
        self.assertTrue(old)
        self.assertTrue(all(c.chunk.kb_version == 3 for c in old))

    def test_chunk_ids_are_stable_so_citations_survive_republishing(self):
        a = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=0)
        b = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=1)
        self.assertEqual([c.id for c in a.chunks], [c.id for c in b.chunks])

    def test_the_title_comes_from_the_first_heading_not_the_filename(self):
        # It is what an agent reads mid-call when deciding whether to trust a
        # suggestion. "Objection Handling v4" beats "m.md".
        pub = publish({"m.md": self.DOC}, tenant_id="t", kb_id="kb", current_version=0)
        self.assertEqual(pub.chunks[0].doc_title, "Manual de objeciones")

    def test_publishing_nothing_is_refused(self):
        with self.assertRaises(PublicationRefused):
            publish({}, tenant_id="t", kb_id="kb", current_version=0)


class Reporting(unittest.TestCase):
    def test_warnings_are_carried_to_the_person_who_uploaded(self):
        flat = Extracted(LONG + "\n\n" + LONG, "flat.txt", "text",
                         ("no headings — structure will be lost",))
        pub = publish({"flat.txt": flat}, tenant_id="t", kb_id="kb", current_version=0)
        self.assertEqual(pub.warnings[0][0], "flat.txt")

    def test_the_summary_states_the_version_it_produced(self):
        pub = publish({"m.md": Extracted("# T\n\n" + LONG + "\n\n" + LONG, "m.md", "text")},
                      tenant_id="t", kb_id="kb", current_version=6)
        self.assertIn("kb_version 7", pub.summary())


if __name__ == "__main__":
    unittest.main()
