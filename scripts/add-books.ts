import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { TaskType } from "@google/generative-ai";

const cleanText = (text: string): string => {
  return text.replace(/\u0000/g, "").replace(/\0/g, "");
};

const run = async () => {
  console.log("🚀 STARTING GOOGLE-POWERED INGESTION (v2)...");
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const googleKey = process.env.GOOGLE_API_KEY!;

  if (!supabaseUrl || !supabaseKey || !googleKey) {
    console.error("❌ MISSING KEYS. Check .env file.");
    return;
  }

  // 1. SETUP GOOGLE EMBEDDINGS (Newer Model)
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: googleKey,
    modelName: "text-embedding-004", // ✅ Updated to newer model
    taskType: TaskType.RETRIEVAL_DOCUMENT, // ✅ Required for better accuracy
  });

  // 2. SANITY CHECK: Test the API Key immediately
  try {
    console.log("🔍 Testing Google API connection...");
    const testVector = await embeddings.embedQuery("hello world");
    console.log(`✅ Google API is working! (Vector dimensions: ${testVector.length})`);
    if (testVector.length !== 768) {
      console.error(`❌ CRITICAL: Vector size is ${testVector.length}, but DB expects 768. Check your SQL table.`);
      return;
    }
  } catch (err: any) {
    console.error("❌ Google API Failed. Check your GOOGLE_API_KEY.");
    console.error("   Error details:", err.message);
    return;
  }

  const booksDir = path.join(process.cwd(), "books");
  const files = fs.readdirSync(booksDir).filter(f => f.endsWith(".pdf") || f.endsWith(".epub") || f.endsWith(".txt"));
  console.log(`📚 Found ${files.length} books.`);

  const client = createClient(supabaseUrl, supabaseKey);

  for (const file of files) {
    console.log(`\n🔹 Processing: ${file}...`);
    try {
      const filePath = path.join(booksDir, file);
      let docs = [];
      
      if (file.endsWith(".pdf")) docs = await new PDFLoader(filePath, { splitPages: false }).load();
      else if (file.endsWith(".epub")) docs = await new EPubLoader(filePath, { splitChapters: false }).load();
      else docs = [{ pageContent: fs.readFileSync(filePath, "utf-8"), metadata: { source: file } }];

      // Check if text extraction worked
      if (docs.length === 0 || docs[0].pageContent.length < 10) {
        console.warn(`   ⚠️ Warning: File ${file} seems empty or unreadable.`);
        continue;
      }

      docs.forEach(doc => {
        doc.pageContent = cleanText(doc.pageContent);
        if (doc.metadata) doc.metadata.source = file;
      });

      const splits = await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitDocuments(docs);
      
      await SupabaseVectorStore.fromDocuments(splits, embeddings, { client, tableName: "documents", queryName: "match_documents" });
      console.log(`   ✅ Uploaded ${splits.length} chunks.`);
    } catch (err: any) {
      console.error(`   ❌ FAILED: ${err.message}`);
    }
  }
  console.log("\n🎉 DONE!");
};
run();