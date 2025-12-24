import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
// NEW: Google Embeddings
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";

// Helper: Clean JSON
function cleanJsonOutput(text: string): string {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return text.substring(start, end + 1);
    }
    return text;
  } catch (e) { return text; }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY; // New Key

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !GOOGLE_KEY) {
    return Response.json({ error: "Missing API Keys (Need Google Key)" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const problem = (body.problem || "").replace(/[\x00-\x1F\x7F]/g, "");
    const options = (body.options || []).map((o: string) => o.replace(/[\x00-\x1F\x7F]/g, ""));

    // --- STEP 1: EMBEDDING (Google) ---
    console.log("🧠 Generating Embedding (Google)...");
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: GOOGLE_KEY,
      modelName: "text-embedding-004",
    });

    let vector;
    try {
      vector = await embeddings.embedQuery(problem);
    } catch (err: any) {
      console.error("❌ Google Embedding Failed:", err.message);
      return Response.json({ error: "Embedding service failed." }, { status: 503 });
    }

    // --- STEP 2: RETRIEVAL ---
    console.log("🔍 Searching Supabase...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: vector,
      match_threshold: 0.1, 
      match_count: 5 
    });

    if (error) throw new Error("Database search failed.");

    if (!documents || documents.length === 0) {
      return Response.json({
        recommendation: "Unable to analyze.",
        short_reason: "No relevant frameworks found.",
        detailed_reasoning: "The system searched your uploaded books but could not find a mental model that applies to this specific problem."
      });
    }

    const contextText = documents.map((doc: any) => doc.content).join("\n---\n");

    // --- STEP 3: REASONING (Groq) ---
    console.log("🤖 Asking Groq...");
    const model = new ChatGroq({
      apiKey: GROQ_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.1, 
    });

    const prompt = PromptTemplate.fromTemplate(`
      You are an expert decision consultant.
      User Problem: {problem}
      User Options: {options}
      CONTEXT FROM LIBRARY (STRICT):
      {context}
      Instructions:
      1. You MUST select exactly one option.
      2. "recommendation": The text of the option you selected.
      3. "short_reason": A concise summary (Maximum 2 sentences).
      4. "detailed_reasoning": A comprehensive analysis (Minimum 150 words).
         - You MUST explicitly name the Mental Models used (e.g. **WRAP Framework**).
         - Use Markdown bolding (**text**) to highlight frameworks.
      5. Return valid JSON only. NO PREAMBLE.
    `);

    const formattedPrompt = await prompt.format({
      context: contextText,
      problem: problem,
      options: options.join(", "),
    });

    const response = await model.invoke(formattedPrompt);
    const rawOutputString = response.content as string; 
    
    let result;
    try {
      result = JSON.parse(cleanJsonOutput(rawOutputString));
    } catch (e) {
      throw new Error("AI returned invalid JSON format.");
    }

    return Response.json(result);

  } catch (e: any) {
    console.error("❌ ERROR:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}