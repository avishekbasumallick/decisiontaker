import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const HF_TOKEN = process.env.HUGGINGFACEHUB_API_TOKEN;

export async function POST(req: Request) {
  console.log("--------------- STRICT RAG REQUEST STARTED ---------------");
  
  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !HF_TOKEN) {
    return Response.json({ error: "Missing API Keys in .env" }, { status: 500 });
  }

  try {
    const { problem, options } = await req.json();

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
    
    // Use the corrected function with 'documents.' prefix
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: vector,
      match_threshold: 0.1, 
      match_count: 5 
    });

    if (error) {
      console.error("❌ Supabase Error:", error);
      throw new Error("Database search failed.");
    }

    // --- STRICTNESS CHECK ---
    if (!documents || documents.length === 0) {
      console.warn("⚠️ STRICT RAG: No documents found. Aborting.");
      return Response.json({
        recommendation: "Unable to analyze.",
        short_reason: "No relevant frameworks found in your book library.",
        detailed_reasoning: "The system searched your uploaded books but could not find a mental model that applies to this specific problem. Please try rephrasing your problem or adding more books to the database."
      });
    }

    const contextText = documents.map((doc: any) => doc.content).join("\n---\n");
    console.log(`✅ Found ${documents.length} relevant book chunks.`);

    // --- STEP 3: REASONING (Groq) ---
    console.log("🤖 Asking Groq (Llama 3.1)...");
    
    const model = new ChatGroq({
      apiKey: GROQ_KEY,
      model: "llama-3.1-8b-instant", // ✅ UPDATED: The new, valid model name
      temperature: 0.1, 
    });

    const parser = new JsonOutputParser();

    const prompt = PromptTemplate.fromTemplate(`
      You are an expert decision consultant. You have access to a specific library of non-fiction books.
      
      User Problem: {problem}
      User Options: {options}
      
      CONTEXT FROM LIBRARY (STRICT):
      {context}
      
      Instructions:
      1. You MUST select exactly one option from the provided list.
      2. You MUST base your reasoning ONLY on the "CONTEXT FROM LIBRARY" provided above.
      3. Return valid JSON only.
      
      {format_instructions}
    `);

    const chain = RunnableSequence.from([prompt, model, parser]);

    const result = await chain.invoke({
      context: contextText,
      problem: problem,
      options: options.join(", "),
      format_instructions: parser.getFormatInstructions(),
    });

    console.log("✅ Success! Sending response.");
    return Response.json(result);

  } catch (e: any) {
    console.error("❌ CRITICAL ERROR:", e);
    return Response.json({ error: e.message || "Unknown Server Error" }, { status: 500 });
  }
}