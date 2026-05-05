# Decision Engine

An AI-powered RAG (Retrieval-Augmented Generation) application that helps you make better decisions by analyzing your options against your knowledge base.

## Features

- **Smart Decision Analysis**: Input any decision or problem with multiple options
- **Knowledge Base Integration**: Leverages your document library for context-aware recommendations
- **Detailed Reasoning**: Get both quick recommendations and in-depth analysis
- **Universal Document Support**: Ingest .txt, .pdf, and .epub files
- **Beautiful UI**: Clean, modern interface built with Next.js and Tailwind CSS

## Tech Stack

- **Framework**: Next.js 13 (App Router) with TypeScript
- **UI**: Tailwind CSS + shadcn/ui components
- **AI**: LangChain.js with Groq LLM (llama3-8b-8192)
- **Embeddings**: HuggingFace (sentence-transformers/all-MiniLM-L6-v2)
- **Database**: Supabase with pgvector
- **Document Processing**: PDF, EPUB, and text file support

## Getting Started

### 1. Configure API Keys

Update the `.env` file with your API keys:

```env
HUGGINGFACE_API_KEY=your_huggingface_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

To get these API keys:
- **HuggingFace**: Sign up at https://huggingface.co and create an API token
- **Groq**: Sign up at https://console.groq.com and create an API key

### 2. Ingest Your Knowledge Base

Add your documents to the `books/` directory:

```bash
books/
├── decision-making-guide.pdf
├── business-strategy.txt
└── leadership-handbook.epub
```

Then run the ingestion script:

```bash
npm run ingest
```

This will:
- Load all supported files from the books directory
- Split them into 1000-character chunks
- Generate embeddings using HuggingFace
- Store everything in your Supabase database

### 3. Use the Decision Engine

The application is ready to use! Simply:

1. Enter your decision or problem
2. Add at least 2 options
3. Click "Analyze Decision"
4. View the recommendation and detailed reasoning

## How It Works

1. **Problem Input**: You describe your decision and provide options
2. **Retrieval**: The system converts your problem into a vector and searches your knowledge base for relevant information
3. **Generation**: Using the retrieved context, the AI analyzes your options and selects the best one
4. **Strict Constraints**: The AI is instructed to only choose from your provided options, never creating new ones

## API Endpoint

The application exposes a REST API endpoint:

```
POST /api/decide
Content-Type: application/json

{
  "problem": "Your decision or problem description",
  "options": ["Option 1", "Option 2", "Option 3"]
}
```

Response:
```json
{
  "recommendation": "Option 2",
  "short_reason": "Brief explanation",
  "detailed_reasoning": "Comprehensive analysis"
}
```

## Database Schema

The application uses a `documents` table with:
- `id`: Unique identifier
- `content`: Document chunk text
- `metadata`: File source information
- `embedding`: 384-dimensional vector (for semantic search)
- `created_at`: Timestamp

A `match_documents` function enables fast similarity search using pgvector.

## Project Structure

```
├── app/
│   ├── api/decide/route.ts    # Decision analysis endpoint
│   ├── page.tsx               # Main UI
│   └── layout.tsx             # Root layout
├── scripts/
│   └── ingest.ts              # Document ingestion script
├── books/                     # Your knowledge base documents
└── components/ui/             # shadcn/ui components
```

## Tips for Best Results

1. **Quality Knowledge Base**: Add relevant documents about decision-making, your industry, or specific domain knowledge
2. **Clear Problems**: Be specific about your decision context
3. **Distinct Options**: Provide clearly different options for analysis
4. **Regular Updates**: Re-run the ingestion script when you add new documents

## Supported File Types

- `.txt` - Plain text files
- `.pdf` - PDF documents (requires pdf-parse)
- `.epub` - EPUB ebooks (requires epub2)
