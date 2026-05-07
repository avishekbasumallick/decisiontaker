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

// Upload chunks in small batches with a short pause between batches to stay
// inside Google's per-minute embedding quota even for very large books.
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // Sanity check: confirm the API key works and the model returns the dim we pinned.
  try {
    console.log("Testing Google API connection...");
    const testVector = await embeddings.embedQuery("hello world");
    console.log(`Google API is working! (Vector dimensions: ${testVector.length})`);
    if (testVector.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `CRITICAL: Vector size is ${testVector.length}, but DB expects ${EMBEDDING_DIMENSIONS}. Check your SQL table.`
      );
      return;
    }
  } catch (err: any) {
    console.error("Google API Failed. Check your GOOGLE_API_KEY.");
    console.error("   Error details:", err.message);
    return;
  }

  const client = createClient(supabaseUrl, supabaseKey);

  const booksDir = path.join(process.cwd(), "books");
  if (!fs.existsSync(booksDir)) {
    console.error(`books/ directory not found at ${booksDir}`);
    return;
  }

  const files = fs
    .readdirSync(booksDir)
    .filter((f) => f.endsWith(".pdf") || f.endsWith(".epub") || f.endsWith(".txt"));
  console.log(`Found ${files.length} books in /books folder.`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    // Per-file dedup. Each chunk we upload tags metadata.source = filename, so a
    // single hit means the whole file was already ingested. To force a re-embed,
    // delete its rows first:
    //   DELETE FROM documents WHERE metadata->>'source' = '<file>';
    const { data: existing, error: existsErr } = await client
      .from("documents")
      .select("id")
      .contains("metadata", { source: file })
      .limit(1);

    if (existsErr) {
      console.error(`   Dedup check failed for ${file}: ${existsErr.message}`);
      failed++;
      continue;
    }

    if (existing && existing.length > 0) {
      console.log(`SKIPPING: ${file} (already in DB)`);
      skipped++;
      continue;
    }

    console.log(`\nProcessing NEW book: ${file}...`);
    try {
      const filePath = path.join(booksDir, file);
      let docs = [];

      if (file.endsWith(".pdf")) {
        docs = await new PDFLoader(filePath, { splitPages: false }).load();
      } else if (file.endsWith(".epub")) {
        docs = await new EPubLoader(filePath, { splitChapters: false }).load();
      } else {
        docs = [
          { pageContent: fs.readFileSync(filePath, "utf-8"), metadata: { source: file } },
        ];
      }

      if (docs.length === 0 || docs[0].pageContent.length < 10) {
        console.warn(`   Warning: File ${file} seems empty or unreadable.`);
        failed++;
        continue;
      }

      docs.forEach((doc) => {
        doc.pageContent = cleanText(doc.pageContent);
        if (doc.metadata) doc.metadata.source = file;
      });

      const splits = await new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      }).splitDocuments(docs);

      console.log(
        `   Split into ${splits.length} chunks. Uploading in batches of ${BATCH_SIZE}...`
      );

      // Batch the uploads. SupabaseVectorStore.fromDocuments embeds each batch
      // server-side and inserts the rows; the sleep keeps Google's per-minute
      // embedding quota happy on large books.
      for (let i = 0; i < splits.length; i += BATCH_SIZE) {
        const batch = splits.slice(i, i + BATCH_SIZE);
        await SupabaseVectorStore.fromDocuments(batch, embeddings, {
          client,
          tableName: "documents",
          queryName: "match_documents",
        });
        process.stdout.write(".");
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }

      console.log(`\n   Uploaded ${file} (${splits.length} chunks).`);
      added++;
    } catch (err: any) {
      console.error(`\n   FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n========================`);
  console.log(`DONE: ${added} added, ${skipped} skipped, ${failed} failed.`);
};
run();
