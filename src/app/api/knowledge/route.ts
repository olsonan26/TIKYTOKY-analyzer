import { guard } from "@/lib/auth";
import { extractKnowledge, readKnowledgeUpload } from "@/lib/knowledge";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    await guard(request);
    const file = await readKnowledgeUpload(request);
    const document = await extractKnowledge(file);
    // Extraction is local and temporary. The browser owns project persistence.
    return json({ document });
  } catch (error) { return apiError(error); }
}
