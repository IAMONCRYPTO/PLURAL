import { getApiKey } from '../config.js';
import { callLLM } from '../providers.js';

export async function web_search(query) {
  const apiKey = await getApiKey('tavily');
  if (!apiKey) {
    throw new Error('Tavily Search API key is missing. Please configure it in Settings.');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 5
    }),
    signal: AbortSignal.timeout(15000) // 15-second timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily search failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    answer: data.answer || '',
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content
    }))
  };
}

export async function deep_research(query, onProgress, configObj = null) {
  if (onProgress) onProgress('Analyzing search query and generating sub-questions...');
  
  const prompt = `You are a researcher. Break down this research query into exactly 3 diverse sub-questions: "${query}". Respond with ONLY the list of sub-questions separated by newlines, with no bullet points or intros.`;
  
  const llmRes = await callLLM([
    { role: 'system', content: 'You are an expert research planner. Output plain text list.' },
    { role: 'user', content: prompt }
  ], null, configObj, 'planner');

  const subQuestions = (llmRes.content || '')
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .slice(0, 3);

  const allResults = [];
  let sourcesChecked = 0;
  const totalSources = subQuestions.length;

  for (let i = 0; i < subQuestions.length; i++) {
    const subQ = subQuestions[i];
    sourcesChecked++;
    if (onProgress) {
      onProgress(`Researching (${sourcesChecked} of ${totalSources} sources checked): "${subQ}"`);
    }

    try {
      const searchRes = await web_search(subQ);
      allResults.push({
        query: subQ,
        answer: searchRes.answer,
        results: searchRes.results
      });
    } catch (e) {
      allResults.push({
        query: subQ,
        error: e.message
      });
    }
  }

  if (onProgress) onProgress('Synthesizing research results into a structured report...');
  
  const synthesisPrompt = `You are a Research Synthesizer. Aggregate the following findings for query "${query}" and write a detailed, objective report. Do not use emojis in your response. Keep it clean and text-based.
  
Findings:
${JSON.stringify(allResults, null, 2)}`;

  const finalRes = await callLLM([
    { role: 'system', content: 'You are a research report writer.' },
    { role: 'user', content: synthesisPrompt }
  ], null, configObj, 'integrator');

  return {
    query,
    report: finalRes.content,
    sourcesChecked,
    details: allResults
  };
}
