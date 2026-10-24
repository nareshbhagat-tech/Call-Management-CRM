import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { db, RECORDINGS_DIR } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";
import { callForUser } from "@/lib/crm";

type Ctx = { params: Promise<{ id: string }> };
const MAX_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".amr": "audio/amr", ".wav": "audio/wav", ".ogg": "audio/ogg", ".3gp": "audio/3gpp", ".opus": "audio/ogg" };

export const POST = route<Ctx>(async (req, user, { params }) => {
  const call = callForUser(Number((await params).id), user);
  if (call.user_id !== user.id) throw new HttpError(403, "Only the agent who made the call can upload its recording");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach the recording as 'file'");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Recording is larger than 50 MB");
  const ext = path.extname(file.name).toLowerCase();
  if (!TYPES[ext]) throw new HttpError(400, `Unsupported audio type ${ext || "(none)"}`);
  const name = `${call.id}${ext}`;
  fs.writeFileSync(path.join(RECORDINGS_DIR, name), Buffer.from(await file.arrayBuffer()));
  db.prepare("UPDATE calls SET recording_file = ? WHERE id = ?").run(name, call.id);
  return json({ ok: true });
});

export const GET = route<Ctx>(async (_req, user, { params }) => {
  const call = callForUser(Number((await params).id), user);
  if (!call.recording_file) throw new HttpError(404, "No recording");
  const file = path.join(RECORDINGS_DIR, call.recording_file);
  if (!fs.existsSync(file)) throw new HttpError(404, "Recording file is missing on the server");
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "content-length": String(fs.statSync(file).size) },
  });
});
