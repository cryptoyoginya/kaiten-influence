#!/usr/bin/env python3
"""Строит docxtemplater-шаблоны из двух договоров юриста (СМЗ и ИП/ООО).

Пропуски (подчёркивания) заменяются на подстановки {tag}. Реквизиты Заказчика
неизменны. Форма определяется выбором пользователя, поэтому статус-полей нет.

Выход:
  lib/contract/template-smz-b64.ts
  lib/contract/template-ip-b64.ts

Запуск: python3 scripts/build_contract_templates.py
"""
import base64, io, re, html, zipfile
from pathlib import Path

DL = Path.home() / "Downloads"
OUT = Path(__file__).resolve().parent.parent / "lib" / "contract"
SRC = {
    "smz": DL / "Договор_оказания_услуг_реклама_смз.docx",
    "ip": DL / "Договор услуг реклама ИП,ООО.docx",
}


def joined(pstr):
    ts = re.findall(r"<w:t(?: [^>]*)?>(.*?)</w:t>", pstr, re.S)
    return "".join(html.unescape(t) for t in ts)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _para(text):
    """Абзац реквизитов Исполнителя (Times New Roman 10.5pt); {tags} остаются как есть."""
    rpr = ('<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" '
           'w:hAnsi="Times New Roman"/><w:color w:val="111111"/>'
           '<w:sz w:val="21"/><w:szCs w:val="21"/>')
    return (f'<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
            f'<w:ind w:left="0" w:right="96" w:firstLine="0"/><w:jc w:val="left"/>'
            f'<w:rPr>{rpr}</w:rPr></w:pPr>'
            f'<w:r><w:rPr>{rpr}</w:rPr>'
            f'<w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>')


def inject_ispolnitel(xml, key):
    """Вставляет реквизиты Исполнителя (второй стороны) под заголовок «Исполнитель»
    в разделе реквизитов. Без этого в конце договора прописан только Заказчик."""
    status = ("Плательщик налога на профессиональный доход (самозанятый)"
              if key == "smz" else "Индивидуальный предприниматель")
    lines = ["{fio}", status, "ИНН: {inn}", "Телефон: {phone}", "Email: {email}"]
    block = "".join(_para(t) for t in lines)

    # находим абзац-заголовок, текст которого ровно «Исполнитель» (не тело договора)
    paras = list(re.finditer(r"<w:p\b[^>]*>.*?</w:p>", xml, re.S))
    target = None
    for m in paras:
        if joined(m.group(0)).strip() == "Исполнитель":
            target = m  # берём последний такой (в разделе реквизитов)
    if not target:
        raise RuntimeError(f"[{key}] заголовок «Исполнитель» не найден")
    pos = target.end()
    return xml[:pos] + block + xml[pos:]


def transform(text):
    """Возвращает (new_text, changed) для одного параграфа."""
    t = text
    low = t.lower()
    new = t

    # дата договора: «___» июня 2026 г./года -> {contract_date}
    if "июня" in low and "«" in t:
        new = re.sub(r"«[\s_]+»\s*июня\s*2026\s*(?:года|г\.)?", "{contract_date}", new)

    # преамбула — ФИО исполнителя
    if "плательщиком нпд" in low or ("индивидуальный предприниматель" in low and "исполнитель»" in low):
        new = re.sub(r"_{3,}", "{fio}", new, count=1)

    # 1.1 — канал
    if "телеграм-канала" in low:
        new = re.sub(r"(телеграм-канала\s*)_{2,}", r"\1{channel}", new)

    # 1.2.2 — дата публикации (в СМЗ пропуска нет — добавляем)
    if "дата публикации" in low:
        new = re.sub(r"(Дата публикации:\s*)_*", r"\1{pub_date}", new)

    # 1.2.3 — сроки/длительность
    if "длительность" in low:
        new = re.sub(r"(длительность\):\s*)_*", r"\1{duration}", new)

    # 5.1 — канал + цена числом + цена прописью
    if "составляет" in low and "рубл" in low:
        new = re.sub(r"(в канале\s*)_{2,}", r"\1{channel}", new)
        new = re.sub(r"(составляет\s*)_{2,}", r"\1{price_num}", new)
        new = re.sub(r"\(\s*_{2,}\s*тысяч\s*\)", "({price_words})", new)

    # подпись исполнителя: строка из подчёркиваний и "/" без имени
    if re.fullmatch(r"_{3,}\s*/\s*", t.strip()):
        new = t.rstrip() + "{fio_short}"

    return new, (new != t)


def build(src, src_key):
    zin = zipfile.ZipFile(src)
    xml = zin.read("word/document.xml").decode("utf-8")

    def repl(m):
        pstr = m.group(0)
        text = joined(pstr)
        new_text, changed = transform(text)
        if not changed:
            return pstr
        open_tag = re.match(r"<w:p\b[^>]*>", pstr).group(0)
        ppr_m = re.search(r"<w:pPr>.*?</w:pPr>", pstr, re.S)
        ppr = ppr_m.group(0) if ppr_m else ""
        return f'{open_tag}{ppr}<w:r><w:t xml:space="preserve">{esc(new_text)}</w:t></w:r></w:p>'

    new_xml = re.sub(r"<w:p\b[^>]*>.*?</w:p>", repl, xml, flags=re.S)
    new_xml = inject_ispolnitel(new_xml, src_key)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            if not info.filename or info.filename.endswith("/"):
                continue
            data = (
                new_xml.encode("utf-8")
                if info.filename == "word/document.xml"
                else zin.read(info.filename)
            )
            zout.writestr(info.filename, data)
    tags = sorted(set(re.findall(r"\{(\w+)\}", new_xml)))
    return base64.b64encode(buf.getvalue()).decode("ascii"), tags


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, src in SRC.items():
        b64, tags = build(src, key)
        path = OUT / f"template-{key}-b64.ts"
        var = "CONTRACT_TEMPLATE_SMZ_B64" if key == "smz" else "CONTRACT_TEMPLATE_IP_B64"
        path.write_text(
            f"// Авто-сгенерировано scripts/build_contract_templates.py — не править.\n"
            f'export const {var} = "{b64}";\n',
            encoding="utf-8",
        )
        # контроль: реквизиты Заказчика на месте
        raw = base64.b64decode(b64)
        zx = zipfile.ZipFile(io.BytesIO(raw)).read("word/document.xml").decode("utf-8")
        print(f"[{key}] tags: {', '.join(tags)}")
        print(f"[{key}] Заказчик ИНН цел: {'7714426252' in zx}  → {path.name}")


if __name__ == "__main__":
    main()
