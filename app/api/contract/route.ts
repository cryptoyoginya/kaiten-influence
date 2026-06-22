import { NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CONTRACT_TEMPLATE_B64 } from "@/lib/contract/template-b64";

export const runtime = "nodejs";

// поля шаблона договора (= подстановки {tag})
const FIELDS = [
  "place", "contract_date",
  "fio", "fio_short", "status", "inn", "snils",
  "bank", "bik", "korr", "rs", "phone", "email",
  "channel", "format", "pub_date", "duration",
  "price_num", "price_words",
];

export async function POST(req: Request) {
  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    /* пусто */
  }

  // дефолты, чтобы договор был осмысленным даже при пустых полях
  const data: Record<string, string> = {};
  for (const f of FIELDS) data[f] = (body[f] ?? "").toString();
  if (!data.format) data.format = "пост";
  if (!data.place) data.place = "Москва";

  try {
    const zip = new PizZip(Buffer.from(CONTRACT_TEMPLATE_B64, "base64"));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });
    doc.render(data);
    const buf = doc.getZip().generate({ type: "nodebuffer" });

    const name = `Договор ${body.fio || ""}`.trim();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="contract.docx"; filename*=UTF-8''${encodeURIComponent(name)}.docx`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "render error" },
      { status: 500 }
    );
  }
}
