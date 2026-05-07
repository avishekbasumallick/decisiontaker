import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { VoyageEmbeddings } from "../lib/embeddings";

// voyage-4-lite default dim is 1024 — matches the Supabase pgvector(1024) column.
const EMBEDDING_MODEL = "voyage-4-lite";
const EMBEDDING_DIMENSIONS = 1024;

// SupabaseVectorStore receives chunks in slices of this size. Inside
// VoyageEmbeddings each call is split again into Voyage-API-batches of up to
// `voyageMaxBatchSize` per request. For most books, a single Supabase write
// = a single Voyage API call.
const SUPABASE_BATCH_SIZE = 30;

// Voyage free-tier-without-payment-method limits: 3 RPM, 10K TPM. We pace at
// ~1 request every 21 seconds to stay under 3 RPM, and cap each Voyage batch
// at 30 chunks (~7.5K tokens) to stay under TPM. With a payment method on
// file (no charge until you cross 200M free tokens) the limits jump to
// 2000 RPM / 8M TPM — drop voyageMinMsBetweenRequests to ~30 in that case.
const VOYAGE_BATCH_SIZE = 30;
const VOYAGE_MIN_MS_BETWEEN_REQUESTS = 21_000;

const cleanText = (text: string): string => {
  return text.replace(/\u0000/g, "").replace(/\0/g, "");
};

const run = async () => {
  console.log("STARTING VOYAGE-AI INGESTION (voyage-4-lite, 1024-d)...");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const voyageKey = process.env.VOYAGE_API_KEY!;

  if (!supabaseUrl || !supabaseKey || !voyageKey) {
    console.error("MISSING KEYS. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY in .env.");
    return;
  }

  const embeddings = new VoyageEmbeddings({
    apiKey: voyageKey,
    model: EMBEDDING_MODEL,
    inputType: "document",
    maxBatchSize: VOYAGE_BATCH_SIZE,
    minMsBetweenRequests: VOYAGE_MIN_MS_BETWEEN_REQUESTS,
    maxRetries: 5,
  });

  // Sanity check: confirm the API key works and the model returns the dim we expect.
  try {
    console.log("Testing Voyage API connection...");
    const testVector = await embeddings.embedQuery("hello world");
    console.log(`Voyage API is working! (Vector dimensions: ${testVector.length})`);
    if (testVector.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `CRITICAL: Vector size is ${testVector.length}, but DB expects ${EMBEDDING_DIMENSIONS}. Check your SQL table type and the model.`
      );
      return;
    }
  } catch (err: any) {
    console.error("Voyage API Failed. Check your VOYAGE_API_KEY.");
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
    // Per-file dedup. To force a re-embed, delete its rows first:
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
        `   Split into ${splits.length} chunks. Uploading in Supabase batches of ${SUPABASE_BATCH_SIZE} (Voyage paces at 1 request / ~${Math.round(VOYAGE_MIN_MS_BETWEEN_REQUESTS / 1000)}s)...`
      );

      for (let i = 0; i < splits.length; i += SUPABASE_BATCH_SIZE) {
        const batch = splits.slice(i, i + SUPABASE_BATCH_SIZE);
        await SupabaseVectorStore.fromDocuments(batch, embeddings, {
          client,
          tableName: "documents",
          queryName: "match_documents",
        });
        process.stdout.write(".");
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
