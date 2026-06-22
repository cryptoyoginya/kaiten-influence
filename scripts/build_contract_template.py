#!/usr/bin/env python3
"""Строит docxtemplater-шаблон из типового договора.

Заменяет данные Исполнителя (блогера) на подстановки {tag}, реквизиты Заказчика
(Кайтен) не трогает. Выход: lib/contract/template-b64.ts (base64 шаблона), чтобы
файл гарантированно попал в бандл Vercel.

Запуск: python3 scripts/build_contract_template.py "<путь к .docx>"
"""
import base64, re, sys, zipfile, io, html
from pathlib import Path

SRC = sys.argv[1] if len(sys.argv) > 1 else str(
    Path.home() / "Downloads" / "Договор оказания услуг по размещению РИМ-2.docx")
OUT_TS = Path(__file__).resolve().parent.parent / "lib" / "contract" / "template-b64.ts"

# (regex, замена) — применяется только к параграфам Исполнителя/предмета/цены/даты
SUBS = [
    (r"Марфицин\s+Александр\s+Юрьевич", "{fio}"),
    (r"Марфицин\s+А\.\s*Ю\.", "{fio_short}"),
    (r"самозанятый", "{status}"),
    (r"582669035820", "{inn}"),
    (r"173-116-240\s*34", "{snils}"),
    (r"АО\s*[“\"«]?\s*Т-?Банк\s*[”\"»]?", "{bank}"),
    (r"044525974", "{bik}"),
    (r"30101810145250000974", "{korr}"),
    (r"40817810900000405285", "{rs}"),
    (r"89263640973", "{phone}"),
    (r"i@amarfitsin\.ru", "{email}"),
    (r"https://t\.me/writingtools", "{channel}"),
    (r"6000\s*\(шесть тысяч\)", "{price_num} ({price_words})"),
    (r"[“\"]03[”\"]\s*июня\s*2026\s*года", "{pub_date}"),
    (r"до\s*31\.12\.2026\s*года,\s*8\s*часов\s*без\s*перекрытия\s*другими\s*публикациями",
     "{duration}"),
    (r"размещения:\s*пост", "размещения: {format}"),
    (r"Воронеж", "{place}"),
    (r"[«\"]02[»\"]\s*июня\s*2026", "«{contract_date}»"),
]


def joined_text(pstr):
    ts = re.findall(r"<w:t(?: [^>]*)?>(.*?)</w:t>", pstr, re.S)
    return "".join(html.unescape(t) for t in ts)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def should_process(text):
    t = text
    return (
        "Исполнитель»" in t
        or "формат размещения" in t
        or "Дата публикации" in t
        or "Сроки размещения" in t
        or ("составляет" in t and "рубл" in t)
        or "Воронеж" in t
        or re.search(r"[«\"]\s*02\s*[»\"]\s*июня", t) is not None
    )


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("word/document.xml").decode("utf-8")

    flag = {"req": False}  # дошли ли до блока реквизитов Исполнителя

    def repl(m):
        pstr = m.group(0)
        text = joined_text(pstr)
        process = flag["req"] or should_process(text)
        # переключаем флаг ПОСЛЕ проверки: заголовок "Исполнитель" сам не трогаем
        if text.strip() == "Исполнитель":
            flag["req"] = True
            return pstr
        if not process:
            return pstr
        new_text = text
        for rx, rep in SUBS:
            new_text = re.sub(rx, rep, new_text)
        if new_text == text:
            return pstr  # нечего менять — не схлопываем (сохраняем формат)
        open_tag = re.match(r"<w:p\b[^>]*>", pstr).group(0)
        ppr_m = re.search(r"<w:pPr>.*?</w:pPr>", pstr, re.S)
        ppr = ppr_m.group(0) if ppr_m else ""
        return (
            f'{open_tag}{ppr}<w:r><w:t xml:space="preserve">{esc(new_text)}'
            f"</w:t></w:r></w:p>"
        )

    new_xml = re.sub(r"<w:p\b[^>]*>.*?</w:p>", repl, xml, flags=re.S)

    # пересобираем docx
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = new_xml.encode("utf-8") if item == "word/document.xml" else zin.read(item)
            zout.writestr(item, data)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text(
        "// Авто-сгенерировано scripts/build_contract_template.py — не править руками.\n"
        f'export const CONTRACT_TEMPLATE_B64 = "{b64}";\n',
        encoding="utf-8",
    )

    # отчёт
    found = sorted(set(re.findall(r"\{(\w+)\}", new_xml)))
    print("Подстановки в шаблоне:", ", ".join(found))
    print("Заказчик ИНН 7714426252 на месте:", "7714426252" in new_xml)
    print(f"Записано: {OUT_TS}")


if __name__ == "__main__":
    main()
