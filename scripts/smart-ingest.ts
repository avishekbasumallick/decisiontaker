import "dotenv/config";
import fs from "fs";
import path from "path";
// Using the stable imports we fixed earlier
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// --- CONFIGURATION ---
const DELAY_BETWEEN_CHUNKS_MS = 100; // Slow down to prevent 429 errors
// ---------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  console.log("🚀 STARTING SMART INGESTION...");
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const hfToken = process.env.HUGGINGFACEHUB_API_TOKEN!;

  if (!supabaseUrl || !supabaseKey || !hfToken) {
    console.error("❌ MISSING KEYS. Check .env file.");
    return;
  }

  const client = createClient(supabaseUrl, supabaseKey);
  const embeddings = new HuggingFaceInferenceEmbeddings({ 
    apiKey: hfToken, 
    model: "sentence-transformers/all-MiniLM-L6-v2" 
  });

  const booksDir = path.join(process.cwd(), "books");
  if (!fs.existsSync(booksDir)) fs.mkdirSync(booksDir);

  const files = fs.readdirSync(booksDir).filter(f => f.endsWith(".pdf") || f.endsWith(".epub") || f.endsWith(".txt"));
  console.log(`📚 Found ${files.length} books in /books folder.`);

  for (const file of files) {
    // 1. CHECK FOR DUPLICATES
    // We check if any row in the DB has metadata -> source equal to this filename
    const { data: existing, error } = await client
      .from("documents")
      .select("id")
      .contains("metadata", { source: file })
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`⏭️  SKIPPING: ${file} (Already exists in DB)`);
      continue;
    }

    console.log(`\n🔹 Processing NEW book: ${file}...`);
    
    try {
      const filePath = path.join(booksDir, file);
      let docs = [];
      
      if (file.endsWith(".pdf")) docs = await new PDFLoader(filePath, { splitPages: false }).load();
      else if (file.endsWith(".epub")) docs = await new EPubLoader(filePath, { splitChapters: false }).load();
      else docs = [{ pageContent: fs.readFileSync(filePath, "utf-8"), metadata: { source: file } }];

      // Clean metadata (ensure 'source' is set correctly for the check above to work next time)
      docs.forEach(d => d.metadata.source = file);

      const splits = await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitDocuments(docs);
      
      console.log(`   🧩 Split into ${splits.length} chunks. Uploading with rate limits...`);

      // 2. UPLOAD IN BATCHES (To avoid rate limits)
      const BATCH_SIZE = 10;
      for (let i = 0; i < splits.length; i += BATCH_SIZE) {
        const batch = splits.slice(i, i + BATCH_SIZE);
        
        await SupabaseVectorStore.fromDocuments(batch, embeddings, { 
          client, 
          tableName: "documents", 
          queryName: "match_documents" 
        });
        
        // Tiny pause to be nice to Hugging Face API
        process.stdout.write("."); // Progress bar
        await sleep(DELAY_BETWEEN_CHUNKS_MS);
      }
      
      console.log(`\n   ✅ Uploaded ${file} successfully.`);

    } catch (err: any) {
      console.error(`\n   ❌ FAILED: ${err.message}`);
    }
  }
  console.log("\n🎉 ALL OPERATIONS DONE!");
};
run();
