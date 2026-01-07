'use client';

import { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
// Removed: import ReactMarkdown from 'react-markdown';

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

  const EXAMPLE_PROBLEM = "Should I fire my brilliant but toxic sales lead, Sarah, who consistently hits targets but alienates team members, or try to coach her, risking further team morale issues?";
  const EXAMPLE_OPTIONS = [
    "Fire Sarah immediately to protect team morale and culture, accepting a temporary dip in sales performance.",
    "Implement a strict performance improvement plan with Sarah, including mandatory coaching and clear behavioral expectations, with termination as the consequence for non-compliance.",
    "Reassign Sarah to a solo contributor role where her brilliance can be utilized without direct team interaction, if such a role exists and is viable."
  ];

  const handleLoadExample = () => {
    setProblem(EXAMPLE_PROBLEM);
    setOptions(EXAMPLE_OPTIONS);
    setResult(null); // Clear previous results when loading example
    setShowDetails(false);
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
          <button 
            onClick={handleLoadExample} 
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            ✨ Try with Example
          </button>
        </div>

        {/* Pro Tip Banner */}
        <div className="bg-blue-50 border-l-4 border-blue-400 text-blue-800 p-4 rounded-md" role="alert">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                💡 Pro Tip: The more details you provide in the Problem and Options fields, the better the AI can match specific mental models from the library.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">The Decision / Problem</label>
              <textarea
                required
                rows={3}
                className="w-full p-3 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the context, stakes, and constraints (e.g. 'I have a limited budget and a tight deadline...')"
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
                    placeholder={idx === 0 ? "Detailed option 1 (e.g. 'Hire a freelancer to save money but risk quality')" : idx === 1 ? "Detailed option 2 (e.g. 'Pay extra for an agency to guarantee speed')" : `Option ${idx + 1}`}
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
                    {result.detailed_reasoning.replace(/\\n/g, '\n').split('\n').map((paragraph: string, index: number) => (
                      paragraph.trim() && (
                        <p key={index} className="mb-4 last:mb-0">
                          {paragraph}
                        </p>
                      )
                    ))}
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