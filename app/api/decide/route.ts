import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";

// --- HELPER: SUPER CLEANER ---
function cleanAndParseJSON(text: string): any {
  try {
    // 1. Remove Markdown code blocks
    let clean = text.replace(/(\`\`\`json|\`\`\`)/g, "");
    
    // 2. Find the JSON object
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      clean = clean.substring(start, end + 1);
    }

    // 3. Fix unescaped newlines (The killer of JSON)
    // This regex looks for newlines that are NOT escaped
    clean = clean.replace(/(?<!\\)\n/g, "\\n");
    
    // 4. Handle Tab characters
    clean = clean.replace(/\t/g, "\\t");

    return JSON.parse(clean);
  } catch (e) {
    // If standard parsing fails, return a polite error object instead of crashing
    console.error("JSON PARSE FAILED:", text);
    return {
      recommendation: "Analysis Generated (Format Error)",
      short_reason: "The AI generated a response but the formatting was slightly off.",
      detailed_reasoning: text // Return raw text so the user at least sees the answer!
    };
  }
}
// -----------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

export async function POST(req: Request) {
  console.log("--------------- API REQUEST STARTED ---------------");

  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !GOOGLE_KEY) {
    return Response.json({ error: "Missing API Keys" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const problem = (body.problem || "").replace(/[\x00-\x1F\x7F]/g, "");
    const options = (body.options || []).map((o: string) => o.replace(/[\x00-\x1F\x7F]/g, ""));

    // --- STEP 1: EMBEDDING (Google) ---
    console.log("🧠 Generating Embedding...");
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: GOOGLE_KEY,
      modelName: "text-embedding-004", // Ensure this matches your script
    });

    let vector;
    try {
      vector = await embeddings.embedQuery(problem);
    } catch (err: any) {
      console.error("❌ Google Embedding Failed:", err.message);
      return Response.json({ error: "Embedding service busy." }, { status: 503 });
    }

    // --- STEP 2: RETRIEVAL ---
    console.log("🔍 Searching Knowledge Base...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Check if we get results
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: vector,
      match_threshold: 0.1, 
      match_count: 10 
    });

    if (error) {
      console.error("Supabase Error:", error);
      throw new Error("Database search failed.");
    }

    // Handle "No Results"
    if (!documents || documents.length === 0) {
      return Response.json({
        recommendation: "Unable to analyze.",
        short_reason: "No relevant frameworks found in your library.",
        detailed_reasoning: "The system searched your uploaded books but could not find a mental model that applies to this specific problem."
      });
    }

    const contextText = documents.map((doc: any) => doc.content).join("\n---\n");
    console.log(`✅ Found ${documents.length} book chunks.`);

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
      1. Select one option.
      2. "recommendation": The option text.
      3. "short_reason": 2 sentences max.
      4. "detailed_reasoning": A structured analysis (Min 150 words).
         - USE MARKDOWN LISTS for frameworks (e.g. "- **WRAP Framework**: ...").
         - USE PARAGRAPHS to separate ideas.
      5. CRITICAL JSON RULES:
         - Return valid JSON only.
         - Use standard double quotes (") for strings.
         - Do NOT use real/literal line breaks inside the JSON strings.
    `);

    const formattedPrompt = await prompt.format({
      context: contextText,
      problem: problem,
      options: options.join(", "),
    });

    const response = await model.invoke(formattedPrompt);
    const rawOutputString = response.content as string; 
    
    // --- ROBUST PARSE WITH DEBUGGING ---
    let result;
    try {
      result = cleanAndParseJSON(rawOutputString);
    } catch (e) {
      console.error("❌ JSON Parse Failed!");
      console.log("--------------- RAW AI OUTPUT START ---------------");
      console.log(rawOutputString);
      console.log("--------------- RAW AI OUTPUT END -----------------");
      throw new Error("AI returned invalid JSON format. Check server logs.");
    }

    return Response.json(result);

  } catch (e: any) {
    console.error("❌ CRITICAL ERROR:", e);
    return Response.json({ error: e.message || "Unknown Server Error" }, { status: 500 });
  }
}