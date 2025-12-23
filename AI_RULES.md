# AI Development Rules for Decision Engine

This document outlines the core technologies and best practices for developing features within the Decision Engine application. Adhering to these guidelines ensures consistency, maintainability, and leverages the strengths of our chosen tech stack.

## Tech Stack Overview

*   **Framework**: Next.js 13 (App Router) with TypeScript for server-side rendering and API routes.
*   **UI Components**: Tailwind CSS for styling, complemented by shadcn/ui for pre-built, accessible components.
*   **AI Orchestration**: LangChain.js for managing interactions with Large Language Models and embedding providers.
*   **Large Language Model (LLM)**: Groq (specifically `llama-3.1-8b-instant`) for decision analysis and reasoning.
*   **Embeddings**: HuggingFace Inference API (using `sentence-transformers/all-MiniLM-L6-v2`) for generating vector embeddings.
*   **Database**: Supabase with `pgvector` for storing and querying document embeddings.
*   **Document Processing**: Utilizes `@langchain/community/document_loaders/fs/pdf`, `@langchain/community/document_loaders/fs/epub`, and `langchain/document_loaders/fs/text` for ingesting various document types (.pdf, .epub, .txt).
*   **Form Management**: `react-hook-form` for robust form handling and `zod` for schema validation.
*   **Icons**: `lucide-react` for all iconography.
*   **Toasts**: `sonner` for simple, global toast notifications.

## Library Usage Guidelines

To maintain a consistent and efficient codebase, please follow these guidelines when implementing new features or modifying existing ones:

*   **UI/Styling**:
    *   Always use **Tailwind CSS** for styling. Avoid inline styles or custom CSS files unless absolutely necessary for global styles.
    *   Prioritize **shadcn/ui components** for common UI elements (buttons, cards, forms, dialogs, etc.). If a required component is not available in shadcn/ui, create a new component in `src/components/` using Tailwind CSS.
*   **AI/LLM Interactions**:
    *   All LLM interactions, including prompt engineering, chain creation, and output parsing, must be handled using **LangChain.js**.
    *   The primary LLM for generation is **Groq** (`llama-3.1-8b-instant`).
    *   Embeddings should be generated using **HuggingFaceInferenceEmbeddings**.
*   **Database Operations**:
    *   Interact with the Supabase database exclusively through the **`@supabase/supabase-js`** client library.
    *   Vector search operations should utilize the `match_documents` RPC function as demonstrated in `app/api/decide/route.ts`.
*   **Document Ingestion**:
    *   Use **`@langchain/community/document_loaders/fs/pdf`**, **`@langchain/community/document_loaders/fs/epub`**, and **`langchain/document_loaders/fs/text`** for loading documents.
    *   Text splitting should be done with **`RecursiveCharacterTextSplitter`** from `langchain/text_splitter`.
    *   Vector storage for ingested documents must use **`SupabaseVectorStore`**.
*   **Form Handling & Validation**:
    *   For any forms, use **`react-hook-form`** for state management and validation.
    *   Schema validation should be implemented with **`zod`**.
*   **Notifications**:
    *   Use **`sonner`** for displaying toast notifications to the user.
*   **Icons**:
    *   All icons should be imported from **`lucide-react`**.
*   **Routing**:
    *   Leverage **Next.js App Router** for all routing within the application.