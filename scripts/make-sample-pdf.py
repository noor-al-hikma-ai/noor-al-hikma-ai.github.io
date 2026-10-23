"""Write a small synthetic policy PDF (no third-party libraries) for the RAG sandbox demo."""
import sys, textwrap

PAGES = [
    ("Demo Bank PJSC - Card Dispute Handling Procedure (synthetic sample)", [
        "1. Scope. This procedure covers disputes raised by retail cardholders for debit and credit card transactions processed through the card schemes. It applies to branches, the contact centre and the mobile application.",
        "2. Time limits. A cardholder must raise a dispute within 60 calendar days of the statement date on which the transaction first appeared. Disputes raised after 60 days are reviewed only if the cardholder demonstrates exceptional circumstances.",
        "3. Provisional credit. For disputed amounts up to AED 5,000 the bank issues a provisional credit within 5 business days of receiving a complete dispute form. Amounts above AED 5,000 require approval by the Card Operations Manager before provisional credit is granted.",
        "4. Evidence. The cardholder provides the dispute form, a copy of the receipt where available and any correspondence with the merchant. Example record: cardholder e-mail cardholder.demo@example.com and IBAN AE45 0260 0010 1234 5678 901 must be redacted before analysis.",
    ]),
    ("Demo Bank PJSC - Card Dispute Handling Procedure (continued)", [
        "5. Chargeback. Card Operations submits the chargeback to the scheme within 10 business days of the provisional credit. If the merchant presents compelling evidence, the provisional credit may be reversed after notifying the cardholder in writing.",
        "6. Fraud disputes. Where the cardholder reports that the card was lost or stolen, the card is blocked immediately and a replacement card is issued within 3 business days. Fraud cases are referred to the Fraud Risk Unit.",
        "7. Escalation. Disputes that remain unresolved after 45 calendar days are escalated to the Head of Card Operations. Complaints about dispute handling follow the bank's consumer protection complaints procedure.",
    ]),
]

def esc(s):
    return s.replace("\\\\", "\\\\\\\\").replace("(", "\\\\(").replace(")", "\\\\)")

def page_stream(title, paras):
    lines = ["BT", "/F1 15 Tf", "56 790 Td", f"({esc(title)}) Tj", "/F1 10.5 Tf", "0 -30 Td", "14 TL"]
    for p in paras:
        for ln in textwrap.wrap(p, 92):
            lines.append(f"({esc(ln)}) Tj T*")
        lines.append("T*")
    lines.append("ET")
    return "\n".join(lines).encode("latin-1")

def build(path):
    objs = []
    def add(b):
        objs.append(b)
        return len(objs)
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages_id = len(objs) + 1 + 2 * len(PAGES) + 0
    page_ids = []
    for title, paras in PAGES:
        s = page_stream(title, paras)
        cid = add(b"<< /Length %d >>\nstream\n" % len(s) + s + b"\nendstream")
        page_ids.append(add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (pages_id, font, cid)))
    kids = " ".join(f"{p} 0 R" for p in page_ids).encode()
    assert add(b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(page_ids)) == pages_id
    cat = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)
    out = bytearray(b"%PDF-1.4\n")
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for o in offs:
        out += b"%010d 00000 n \n" % o
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, cat, xref)
    open(path, "wb").write(out)

build(sys.argv[1] if len(sys.argv) > 1 else "public/samples/demo_bank_card_disputes.pdf")
