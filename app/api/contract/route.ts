import { NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CONTRACT_TEMPLATE_SMZ_B64 } from "@/lib/contract/template-smz-b64";
import { CONTRACT_TEMPLATE_IP_B64 } from "@/lib/contract/template-ip-b64";

export const runtime = "nodejs";

// поля шаблонов договора (= подстановки {tag})
const FIELDS = [
  "fio", "fio_short", "channel", "pub_date", "duration",
  "price_num", "price_words", "contract_date",
];

export async function POST(req: Request) {
  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    /* пусто */
  }

  const tpl = body.form === "ip" ? CONTRACT_TEMPLATE_IP_B64 : CONTRACT_TEMPLATE_SMZ_B64;

  const data: Record<string, string> = {};
  for (const f of FIELDS) data[f] = (body[f] ?? "").toString();

  try {
    const zip = new PizZip(Buffer.from(tpl, "base64"));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });
    doc.render(data);
    const buf = doc.getZip().generate({ type: "nodebuffer" });

    const formName = body.form === "ip" ? "ИП" : "самозанятый";
    const name = `Договор ${formName} ${body.fio || ""}`.trim();
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
