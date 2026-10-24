import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";
import { createLead } from "@/lib/crm";
import { parseCsv } from "@/lib/csv";

/** CSV with a header row containing "name" and "phone" (optional "source"). */
export const POST = route(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a CSV file");
  const [header, ...rows] = parseCsv(await file.text());
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const [iName, iPhone, iSource] = ["name", "phone", "source"].map((c) => cols.indexOf(c));
  if (iName < 0 || iPhone < 0) throw new HttpError(400, 'CSV needs "name" and "phone" columns');
  let created = 0;
  let duplicates = 0;
  const errors: string[] = [];
  db.transaction(() => {
    rows.forEach((r, i) => {
      try {
        const res = createLead({ name: r[iName] || "Unknown", phone: r[iPhone] ?? "", source: iSource >= 0 ? r[iSource] : "import" });
        res.created ? created++ : duplicates++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${(e as Error).message}`);
      }
    });
  })();
  return json({ created, duplicates, errors: errors.slice(0, 20) });
}, "admin");
