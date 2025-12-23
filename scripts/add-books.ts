cat <<EOF > scripts/add-books.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
// Using the stable imports
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// --- THE FIX: TEXT SANITIZER ---
// Removes null bytes and other Postgres-breaking characters
const cleanText = (text: string): string => {
  return text.replace(/\u0000/g, "").replace(/\0/g, ""); // Remove null bytes
};
// -------------------------------

const run = async () => {
  console.log("🚀 STARTING BULK INGESTION WITH SANITIZER...");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const hfToken = process.env.HUGGINGFACEHUB_API_TOKEN!;

  if (!supabaseUrl || !supabaseKey || !hfToken) {
    console.error("❌ MISSING KEYS. Check .env file.");
    return;
  }

  const booksDir = path.join(process.cwd(), "books");
  if (!fs.existsSync(booksDir)) fs.mkdirSync(booksDir);

  const files = fs.readdirSync(booksDir).filter(f => f.endsWith(".pdf") || f.endsWith(".epub") || f.endsWith(".txt"));
  console.log(\`📚 Found \${files.length} books in /books folder.\`);

  const client = createClient(supabaseUrl, supabaseKey);
  const embeddings = new HuggingFaceInferenceEmbeddings({ apiKey: hfToken, model: "sentence-transformers/all-MiniLM-L6-v2" });

  for (const file of files) {
    console.log(\`\n🔹 Processing: \${file}...\`);
    try {
      const filePath = path.join(booksDir, file);
      let docs = [];
      
      // Load and clean immediately
      if (file.endsWith(".pdf")) docs = await new PDFLoader(filePath, { splitPages: false }).load();
      else if (file.endsWith(".epub")) docs = await new EPubLoader(filePath, { splitChapters: false }).load();
      else docs = [{ pageContent: fs.readFileSync(filePath, "utf-8"), metadata: { source: file } }];

      // SANITIZE EVERY PAGE
      docs.forEach(doc => {
        doc.pageContent = cleanText(doc.pageContent);
        // Also ensure metadata doesn't have nulls
        if (doc.metadata) {
            doc.metadata.source = file; // Ensure source exists
        }
      });

      const splits = await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitDocuments(docs);
      
      await SupabaseVectorStore.fromDocuments(splits, embeddings, { client, tableName: "documents", queryName: "match_documents" });
      console.log(\`   ✅ Uploaded \${splits.length} chunks.\`);
    } catch (err: any) {
      console.error(\`   ❌ FAILED: \${err.message}\`);
    }
  }
  console.log("\n🎉 DONE!");
};
run();
EOF