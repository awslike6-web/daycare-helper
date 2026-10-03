/** AI 호출은 인증된 동일 출처 Worker만 통과한다. */
(() => {
  async function generate(payload, options = {}) {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: options.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI 생성 실패');
    return data;
  }
  async function refine(input) {
    const response = await generate({ ...input, selectedFormats: ['kidsnote'], images: [],
      refinement: { title: input.currentTitle, content: input.currentContent, instruction: input.instruction } });
    return response.data.kidsnote || {};
  }
  window.GeminiClient = { generate, refine };
})();
