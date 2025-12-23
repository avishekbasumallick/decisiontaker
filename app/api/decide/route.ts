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

// Function to sanitize input strings by removing non-printable control characters
function sanitizeInput(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, '');
}

// Function to clean potentially malformed JSON output from the LLM
function cleanJsonOutput(text: string): string {
  let cleaned = text;

  // 1. Try to extract JSON from a markdown code block if present
  const jsonMatch = cleaned.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    cleaned = jsonMatch[1];
  }

  // 2. Remove any remaining non-printable control characters
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Attempt to fix common unescaped characters within JSON string values
  // This is a heuristic to escape unescaped newlines, carriage returns, and tabs inside string values.
  // The regex looks for a double quote, then any characters (non-greedy),
  // then an unescaped control character, then any characters (non-greedy), then a double quote.
  cleaned = cleaned.replace(/(".*?[^\\])\n(.*?")/gs, '$1\\\\n$2');
  cleaned = cleaned.replace(/(".*?[^\\])\r(.*?")/gs, '$1\\\\r$2');
  cleaned = cleaned.replace(/(".*?[^\\])\t(.*?")/gs, '$1\\\\t$2');

  return cleaned;
}

export async function POST(req: Request) {
  console.log("--------------- STRICT RAG REQUEST STARTED ---------------");
  
  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !HF_TOKEN) {
    return Response.json({ error: "Missing API Keys in .env" }, { status: 500 });
  }

  try {
    const { problem: rawProblem, options: rawOptions } = await req.json();

    // Sanitize user inputs before sending to the LLM
    const problem = sanitizeInput(rawProblem);
    const options = rawOptions.map((opt: string) => sanitizeInput(opt));

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
      model: "llama-3.1-8b-instant",
      temperature: 0.1, 
    });

    // Use JsonOutputParser to get format instructions for the prompt
    const parser = new JsonOutputParser();

    const prompt = PromptTemplate.fromTemplate(`
      You are an expert decision consultant. You have access to a specific library of non-fiction books.
      
      User Problem: {problem}
      User Options: {options}
      
      CONTEXT FROM LIBRARY (STRICT):
      {context}
      
      Instructions:
      1. You MUST select exactly one option from the provided list.
      2. "recommendation": The text of the option you selected.
      3. "short_reason": A concise summary (Maximum 2 sentences) explaining the choice.
      4. "detailed_reasoning": A comprehensive analysis (Minimum 150 words).
         - You MUST explicitly name the Mental Models or Frameworks used from the context (e.g., **WRAP Framework**, **Second-Order Thinking**).
         - Use Markdown bolding (**) to highlight these framework names.
         - Explain how the specific context applies to the user's problem.
      5. Return valid JSON only.
      
      {format_instructions}
    `);

    // Create a chain that gets the raw AI message content
    const chain = RunnableSequence.from([prompt, model]);

    const rawAiResponse = await chain.invoke({
      context: contextText,
      problem: problem,
      options: options.join(", "),
      format_instructions: parser.getFormatInstructions(),
    });

    let result;
    const rawOutputString = rawAiResponse.content; // Extract the string content from the AI message

    // Attempt to parse the JSON, with a fallback to clean and re-parse
    try {
      result = JSON.parse(rawOutputString);
    } catch (parseError) {
      console.warn("Initial JSON parse failed, attempting repair...", parseError);
      const cleanedOutput = cleanJsonOutput(rawOutputString);
      try {
        result = JSON.parse(cleanedOutput);
      } catch (repairError) {
        console.error("JSON repair also failed:", repairError);
        // If repair fails, return an error response
        return Response.json({
          recommendation: "Analysis failed.",
          short_reason: "Could not parse AI response due to malformed JSON.",
          detailed_reasoning: `The AI generated an unparseable response. Original parsing error: ${parseError}. Repair attempt error: ${repairError}. Raw output: ${rawOutputString}`
        }, { status: 500 });
      }
    }

    console.log("✅ Success! Sending response.");
    return Response.json(result);

  } catch (e: any) {
    console.error("❌ CRITICAL ERROR:", e);
    return Response.json({ error: e.message || "Unknown Server Error" }, { status: 500 });
  }
}