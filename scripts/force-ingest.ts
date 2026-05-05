import "dotenv/config";
import fs from "fs";
import path from "path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

const run = async () => {
  console.log("🚀 STARTING FORCE INGESTION...");

  // 1. SETUP KEYS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const hfToken = process.env.HUGGINGFACEHUB_API_TOKEN!;

  if (!supabaseUrl || !supabaseKey || !hfToken) {
    console.error("❌ MISSING KEYS. Check .env file.");
    return;
  }

  // 2. READ FILE DIRECTLY
  // Make sure your file is named exactly this inside the 'books' folder!
  const filePath = path.join(process.cwd(), "books", "sample-decision-guide.txt");
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ FILE NOT FOUND at: ${filePath}`);
    console.error("   Make sure the file name in the 'books' folder matches exactly.");
    return;
  }

  console.log("📖 Reading file...");
  const text = fs.readFileSync(filePath, "utf-8");
  console.log(`   - Found ${text.length} characters of text.`);

  // 3. SPLIT TEXT
  console.log("✂️  Splitting text...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const docs = await splitter.createDocuments([text]);
  console.log(`   - Created ${docs.length} chunks.`);

  // 4. EMBED & UPLOAD
  console.log("🧠 Connecting to AI & Database...");
  const embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: hfToken,
    model: "sentence-transformers/all-MiniLM-L6-v2",
  });

  const client = createClient(supabaseUrl, supabaseKey);

  try {
    console.log("📤 Uploading to Supabase...");
    await SupabaseVectorStore.fromDocuments(docs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });
    console.log("✅ SUCCESS! Data is now in Supabase.");
  } catch (err: any) {
    console.error("❌ UPLOAD FAILED:", err.message);
  }
};

run();