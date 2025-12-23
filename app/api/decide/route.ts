import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { PromptTemplate } from "@langchain/core/prompts";

// --- HELPER: ROBUST JSON EXTRACTION ---
function cleanJsonOutput(text: string): string {
  try {
    // 1. Find the first '{' and the last '}'
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    // If we found brackets, extract just that part
    if (start !== -1 && end !== -1) {
      return text.substring(start, end + 1);
    }
    
    // Fallback: Return original text if no brackets found (will likely fail parse, but we tried)
    return text;
  } catch (e) {
    return text;
  }
}
// --------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const HF_TOKEN = process.env.HUGGINGFACEHUB_API_TOKEN;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !HF_TOKEN) {
    return Response.json({ error: "Missing API Keys in .env" }, { status: 500 });
  }

  try {
    const body = await req.json();
    
    // Sanitize Inputs
    const problem = (body.problem || "").replace(/[\x00-\x1F\x7F]/g, "");
    const options = (body.options || []).map((o: string) => o.replace(/[\x00-\x1F\x7F]/g, ""));

    // --- STEP 1: EMBEDDING ---
    console.log("🧠 Generating Embedding...");
    const embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: HF_TOKEN, 
      model: "sentence-transformers/all-MiniLM-L6-v2",
    });

    let vector;
    try {
      vector = await embeddings.embedQuery(problem);
    } catch (err: any) {
      console.error("❌ Embedding Failed:", err.message);
      return Response.json({ error: "Hugging Face is busy. Please try again in 5 seconds." }, { status: 503 });
    }

    // --- STEP 2: RETRIEVAL ---
    console.log("🔍 Searching Knowledge Base...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: vector,
      match_threshold: 0.1, 
      match_count: 5 
    });

    if (error) throw new Error("Database search failed.");

    // --- STRICTNESS CHECK ---
    if (!documents || documents.length === 0) {
      return Response.json({
        recommendation: "Unable to analyze.",
        short_reason: "No relevant frameworks found in your book library.",
        detailed_reasoning: "The system searched your uploaded books but could not find a mental model that applies to this specific problem."
      });
    }

    const contextText = documents.map((doc: any) => doc.content).join("\n---\n");

    // --- STEP 3: REASONING (Groq) ---
    console.log("🤖 Asking Groq (Llama 3.1)...");
    
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
      5. Return valid JSON only. NO PREAMBLE. NO MARKDOWN. JUST THE JSON OBJECT.
    `);

    const formattedPrompt = await prompt.format({
      context: contextText,
      problem: problem,
      options: options.join(", "),
    });

    const response = await model.invoke(formattedPrompt);
    const rawOutputString = response.content as string; 
    
    // --- ROBUST CLEAN & PARSE ---
    let result;
    try {
      // 1. Extract just the JSON part { ... }
      const cleanString = cleanJsonOutput(rawOutputString);
      
      // 2. Parse it
      result = JSON.parse(cleanString);
    } catch (e) {
      console.error("❌ JSON Parse Failed on output:", rawOutputString);
      throw new Error("AI returned invalid JSON format.");
    }

    return Response.json(result);

  } catch (e: any) {
    console.error("❌ CRITICAL ERROR:", e);
    return Response.json({ error: e.message || "Unknown Server Error" }, { status: 500 });
  }
}