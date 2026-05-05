import "dotenv/config"; // Load keys
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

async function testConnection() {
  console.log("🔍 STARTING DIAGNOSTIC TEST...\n");

  // 1. CHECK KEYS
  console.log("1️⃣  Checking Environment Variables:");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hf = process.env.HUGGINGFACEHUB_API_TOKEN;

  console.log(`   - Supabase URL:   ${url ? "✅ Found" : "❌ MISSING"}`);
  console.log(`   - Supabase Key:   ${key ? "✅ Found" : "❌ MISSING"}`);
  console.log(`   - HuggingFace Key: ${hf ? "✅ Found" : "❌ MISSING"}`);

  if (!url || !key) {
    console.error("\n🛑 STOPPING: You are missing Supabase keys in your .env file.");
    return;
  }

  // 2. CHECK FILES
  console.log("\n2️⃣  Checking 'books' folder:");
  const booksPath = path.join(process.cwd(), "books");
  if (fs.existsSync(booksPath)) {
    const files = fs.readdirSync(booksPath);
    console.log(`   - Folder exists. Contains ${files.length} files:`, files);
    if (files.length === 0) console.warn("   ⚠️  WARNING: The folder is empty!");
  } else {
    console.error("   ❌ ERROR: 'books' folder does not exist at " + booksPath);
  }

  // 3. CHECK SUPABASE CONNECTION
  console.log("\n3️⃣  Testing Supabase Connection...");
  const supabase = createClient(url, key);
  
  try {
    // Try to count rows in the 'documents' table
    const { count, error } = await supabase.from("documents").select("*", { count: "exact", head: true });
    
    if (error) {
      console.error("   ❌ CONNECTION FAILED:", error.message);
      console.error("      (Hint: Did you run the SQL to create the 'documents' table?)");
    } else {
      console.log("   ✅ Connection Successful!");
      console.log(`   - Current rows in 'documents' table: ${count}`);
    }
  } catch (err) {
    console.error("   ❌ UNEXPECTED ERROR:", err);
  }
}

testConnection();