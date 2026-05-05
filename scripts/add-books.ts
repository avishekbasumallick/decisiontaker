import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GeminiEmbeddings } from "../lib/embeddings";

// gemini-embedding-001 defaults to 3072 dims; we pin 768 via Matryoshka
// (outputDimensionality) so it matches the Supabase pgvector(768) column.
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

const cleanText = (text: string): string => {
  return text.replace(/\u0000/g, "").replace(/\0/g, "");
};

const run = async () => {
  console.log("STARTING GOOGLE-POWERED INGESTION (gemini-embedding-001)...");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const googleKey = process.env.GOOGLE_API_KEY!;

  if (!supabaseUrl || !supabaseKey || !googleKey) {
    console.error("MISSING KEYS. Check .env file.");
    return;
  }

  const embeddings = new GeminiEmbeddings({
    apiKey: googleKey,
    model: EMBEDDING_MODEL,
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType: "RETRIEVAL_DOCUMENT",
  });

  try {
    console.log("Testing Google API connection...");
    const testVector = await embeddings.embedQuery("hello world");
    console.log(`Google API is working! (Vector dimensions: ${testVector.length})`);
    if (testVector.length !== EMBEDDING_DIMENSIONS) {
      console.error(`CRITICAL: Vector size is ${testVector.length}, but DB expects ${EMBEDDING_DIMENSIONS}. Check your SQL table.`);
      return;
    }
  } catch (err: any) {
    console.error("Google API Failed. Check your GOOGLE_API_KEY.");
    console.error("   Error details:", err.message);
    return;
  }

  const booksDir = path.join(process.cwd(), "books");
  const files = fs.readdirSync(booksDir).filter(f => f.endsWith(".pdf") || f.endsWith(".epub") || f.endsWith(".txt"));
  console.log(`Found ${files.length} books.`);

  const client = createClient(supabaseUrl, supabaseKey);

  for (const file of files) {
    console.log(`\nProcessing: ${file}...`);
    try {
      const filePath = path.join(booksDir, file);
      let docs = [];

      if (file.endsWith(".pdf")) docs = await new PDFLoader(filePath, { splitPages: false }).load();
      else if (file.endsWith(".epub")) docs = await new EPubLoader(filePath, { splitChapters: false }).load();
      else docs = [{ pageContent: fs.readFileSync(filePath, "utf-8"), metadata: { source: file } }];

      if (docs.length === 0 || docs[0].pageContent.length < 10) {
        console.warn(`   Warning: File ${file} seems empty or unreadable.`);
        continue;
      }

      docs.forEach(doc => {
        doc.pageContent = cleanText(doc.pageContent);
        if (doc.metadata) doc.metadata.source = file;
      });

      const splits = await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitDocuments(docs);

      await SupabaseVectorStore.fromDocuments(splits, embeddings, { client, tableName: "documents", queryName: "match_documents" });
      console.log(`   Uploaded ${splits.length} chunks.`);
    } catch (err: any) {
      console.error(`   FAILED: ${err.message}`);
    }
  }
  console.log("\nDONE!");
};
run();
