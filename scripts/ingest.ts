import "dotenv/config"; 
// 1. FIX: Import from the main 'document_loaders' entry point or community
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
// If the line above fails, LangChain wants us to use the barrel file:
// import { DirectoryLoader } from "langchain/document_loaders"; 
// BUT the safest bet for v0.2+ is often to keep the deep path but ensure the package version is matched.
// However, since it failed, let's switch to the @langchain/community package for the loaders which is the new standard.

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
// TextLoader and DirectoryLoader are often still in the main package but require specific paths.
// Let's try the safest "barrel" import which works across most versions:
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
// NOTE: If the above still fails, we will try the @langchain/community namespace below.

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// ... [Rest of code]