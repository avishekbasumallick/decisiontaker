'use client';

import { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export default function DecisionTool() {
  const [problem, setProblem] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => setOptions([...options, '']);
  
  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setShowDetails(false);

    try {
      const response = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, options: options.filter(o => o.trim() !== "") }),
      });
      
      const rawData = await response.json();
      
      if (!response.ok) {
        throw new Error(rawData.error || "Analysis failed");
      }
      
      // --- SMART ADAPTER ---
      // This ensures we display text regardless of what keys the AI decided to use
      const adaptedResult = {
        recommendation: rawData.recommendation || rawData.selected_option || "Decision Made",
        short_reason: rawData.short_reason || rawData.rationale || rawData.reasoning || "View details for reasoning.",
        detailed_reasoning: rawData.detailed_reasoning || rawData.rationale || "No detailed context provided."
      };
      // ---------------------

      setResult(adaptedResult);
    } catch (error: any) {
      console.error(error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">✨ Decision Engine</h1>
          <p className="mt-2 text-gray-600">Decision analysis backed by a RAG knowledge base comprising the best material available on decision taking</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">The Decision / Problem</label>
              <textarea
                required
                rows={3}
                className="w-full p-3 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Should I quit my job to start a bakery?"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-700">Options</label>
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="py-2 text-gray-500 font-bold">{idx + 1}.</span>
                  <input
                    required
                    className="flex-1 p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(idx)} className="text-red-400 hover:text-red-600 px-2">✕</button>
                  )}
                </div>
              ))}
              <div className="flex justify-end">
                 <button type="button" onClick={addOption} className="text-sm border px-3 py-1 rounded hover:bg-gray-50 text-gray-700">
                  + Add Option
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Analyzing...</span> : "✨ Analyze Decision"}
            </button>
          </form>
        </div>

        {result && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`p-6 rounded-xl text-center border ${result.recommendation === 'Unable to analyze.' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <h2 className={`text-sm font-bold uppercase tracking-wide mb-2 ${result.recommendation === 'Unable to analyze.' ? 'text-yellow-800' : 'text-green-800'}`}>
                {result.recommendation === 'Unable to analyze.' ? 'Result' : 'Recommendation'}
              </h2>
              <div className="text-2xl font-bold text-gray-900 mb-2">{result.recommendation}</div>
              <p className="text-gray-700">{result.short_reason}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <button 
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-semibold text-gray-700">View Detailed Reasoning</span>
                {showDetails ? <ChevronUp className="h-5 w-5 text-gray-500"/> : <ChevronDown className="h-5 w-5 text-gray-500"/>}
              </button>
              
              {showDetails && (
                <div className="p-6 text-gray-700 prose prose-sm max-w-none border-t bg-white">
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {result.detailed_reasoning}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}