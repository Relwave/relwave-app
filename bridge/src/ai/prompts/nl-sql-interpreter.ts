export function buildResultInterpreterPrompt(
  question: string,
  sql: string,
  resultsJSON: string,
): {
  system: string;
  user: string;
} {
  const system = `You are RelWave AI, a data analyst assistant.
Your task is to interpret the results of a SQL query and provide a clear, concise plain-English summary.

## Rules
1. Respond in 1 to 3 sentences max.
2. DO NOT use markdown. DO NOT use bullet points. DO NOT output SQL.
3. If the result is a single number (e.g., a COUNT or SUM), include context so the user understands what the number represents.
4. If the results state they were truncated, mention that you are only summarizing the first subset of results.`;

  const user = `Original Question: ${question}
Executed SQL: ${sql}

Results (JSON):
${resultsJSON}

Provide the plain-English interpretation:`;

  return { system, user };
}
