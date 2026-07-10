import path from 'path';
import { callLLM } from './providers.js';
import { read_file, write_file, edit_file, list_directory, search_files, delete_file } from './tools/fileOps.js';
import { execute_command } from './tools/terminal.js';
import { git_status, git_diff, git_commit, git_log, git_branch } from './tools/git.js';
import { web_search } from './tools/search.js';
import { addSessionMessage } from './session.js';

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

/** Maximum characters kept from a single tool result before truncation. */
const MAX_TOOL_RESULT = 30000;

/** Approximate token budget before older tool results are summarized. */
const TOKEN_BUDGET = 80000;

/**
 * Extract the first balanced JSON object from a string.
 * Replaces the old greedy /{[\s\S]*}/ regex which could match across
 * multiple JSON blocks and produce invalid output.
 */
function extractJSON(text) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.substring(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Rough token estimate (1 token ≈ 4 chars).
 * Used to decide when to compress older messages.
 */
function estimateTokens(messages) {
  return messages.reduce((sum, m) => sum + ((m.content || '').length / 4), 0);
}

/**
 * Truncate a tool result string if it exceeds MAX_TOOL_RESULT.
 */
function truncateResult(result) {
  if (typeof result === 'string' && result.length > MAX_TOOL_RESULT) {
    return result.substring(0, MAX_TOOL_RESULT) +
      `\n[TRUNCATED - showing first ${MAX_TOOL_RESULT} of ${result.length} chars]`;
  }
  return result;
}

/**
 * Summarize older tool-result messages when the context window is too large.
 * Replaces full content with a short preview to stay within TOKEN_BUDGET.
 */
function compressMessages(messages) {
  const estimatedTokens = estimateTokens(messages);
  if (estimatedTokens <= TOKEN_BUDGET) return;

  // Walk from oldest to newest, summarizing tool results until under budget.
  for (let i = 0; i < messages.length; i++) {
    if (estimateTokens(messages) <= TOKEN_BUDGET) break;
    const msg = messages[i];
    if (msg.role === 'tool' && msg.content && msg.content.length > 400) {
      msg.content = `[Previous tool result summarized: ${msg.content.substring(0, 200)}...]`;
    }
  }
}

// ────────────────────────────────────────────────────────
// Agent Class
// ────────────────────────────────────────────────────────

export class Agent {
  constructor(projectPath, options = {}) {
    this.projectPath = path.resolve(projectPath);
    this.options = options;
    this.cancelled = false;
    this.abortController = new AbortController();
    this.startTime = null;
    this.toolCallCount = 0;
    this.filesRead = new Set();
    this.filesWritten = new Set();
  }

  cancel() {
    this.cancelled = true;
    this.abortController.abort();
    console.log('[Orchestrator] Cancel requested.');
  }

  // ──────────────────────────────────────────────────────
  // Main Pipeline
  // ──────────────────────────────────────────────────────

  async run(userPrompt, chatHistory = []) {
    this.startTime = Date.now();
    this.toolCallCount = 0;
    this.filesRead.clear();
    this.filesWritten.clear();

    let integratorContent = null;

    try {
      // ────────────────────────────────────────────────────
      // PHASE 0: INTENT CLASSIFICATION (Chat vs Code)
      // ────────────────────────────────────────────────────
      this.options.onThinking?.({ agent: 'Planner', iteration: 1 });

      const intentSystemPrompt = `You are the Chief Planner for an AI coding assistant called Plural Code.
Your FIRST job is to determine the user's intent. Analyze their message and classify it.

Workspace Directory: ${this.projectPath}

You MUST respond with a JSON object in this exact format:
{
  "intent": "chat" | "code",
  "reason": "Brief explanation of why you classified it this way"
}

Classification rules:
- "chat": The user is having a conversation, asking questions, greeting, discussing ideas, asking about the project conceptually, or anything that does NOT require writing/modifying/creating code or files.
  Examples: "hello", "what does this project do?", "explain how React works", "what tech stack should I use?", "tell me about my project", "how are you?", "thanks"
- "code": The user wants you to BUILD, CREATE, MODIFY, FIX, DELETE, or WRITE code/files. They want actual implementation work done.
  Examples: "create a landing page", "fix the bug in auth", "add a login form", "install express", "make a 3d landing page", "update the navbar", "build an API"

If in doubt, classify as "chat" — it's better to have a conversation first than to start coding unnecessarily.

Respond with ONLY the JSON object, nothing else.`;

      const intentMessages = [
        { role: 'system', content: intentSystemPrompt }
      ];

      // Include chat history for context
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          const role = msg.role === 'user' ? 'user' : 'assistant';
          intentMessages.push({ role, content: msg.text || msg.content || '' });
        }
      }

      intentMessages.push({ role: 'user', content: userPrompt });

      const intentRes = await callLLM(intentMessages, null, this.options.config, 'planner');

      let userIntent = 'code'; // default to code if parsing fails
      try {
        const jsonStr = extractJSON(intentRes.content);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed.intent === 'chat' || parsed.intent === 'code') {
            userIntent = parsed.intent;
          }
        }
      } catch (e) {
        console.error('Intent classification parse error:', e);
      }

      console.log(`[Orchestrator] Intent classified as: ${userIntent}`);

      // ────────────────────────────────────────────────────
      // CHAT MODE: Chief responds directly, no coding pipeline
      // ────────────────────────────────────────────────────
      if (userIntent === 'chat') {
        const chatSystemPrompt = `You are the Chief Planner of Plural Code, an AI coding assistant.
The user is having a conversation with you — they are NOT asking you to write or modify code right now.

Workspace Directory: ${this.projectPath}
You have access to read_file and list_directory tools if you need to look at the project to answer questions about it.

Respond naturally and helpfully. Be conversational, friendly, and knowledgeable.
If the user asks about their project, you can use your tools to inspect it and give informed answers.
If at any point you realize the user actually wants code changes, tell them to ask specifically and you will switch to coding mode.

Do not use emojis in your response. Keep it professional but friendly.`;

        const chatMessages = [
          { role: 'system', content: chatSystemPrompt }
        ];

        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            chatMessages.push({ role, content: msg.text || msg.content || '' });
          }
        }

        chatMessages.push({ role: 'user', content: userPrompt });

        // Mini tool loop for chat (the Chief can read files to answer questions)
        const chatTools = this.buildPlannerToolsArray();
        let chatDone = false;
        let chatIteration = 0;
        let chatResponse = '';

        while (chatIteration < 5 && !chatDone) {
          if (this.cancelled) throw new Error('Task was cancelled by the user.');
          chatIteration++;

          const chatRes = await callLLM(chatMessages, chatTools, this.options.config, 'planner');

          if (chatRes.tool_calls && chatRes.tool_calls.length > 0) {
            chatMessages.push({
              role: 'assistant',
              content: chatRes.content || null,
              tool_calls: chatRes.tool_calls
            });

            for (const tc of chatRes.tool_calls) {
              if (this.cancelled) break;
              this.toolCallCount++;

              let args = {};
              try {
                args = typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              } catch (e) { /* ignore */ }

              this.options.onToolCall?.({ id: tc.id, name: tc.function.name, arguments: args });

              let result = '';
              try {
                result = await this.executeTool(tc.function.name, args);
                result = truncateResult(result);
              } catch (err) {
                result = `Error: ${err.message}`;
              }

              chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
              this.options.onToolResult?.({ id: tc.id, name: tc.function.name, result });
            }
          } else {
            chatResponse = chatRes.content || '';
            chatDone = true;
          }
        }

        // If tool loop exhausted, grab last content
        if (!chatResponse) {
          chatResponse = chatMessages.filter(m => m.role === 'assistant').pop()?.content || 'I could not generate a response.';
        }

        integratorContent = chatResponse;
        this.options.onText?.(chatResponse);

        this.options.onDone?.({
          success: true,
          duration: Date.now() - this.startTime,
          toolCalls: this.toolCallCount,
          filesRead: Array.from(this.filesRead),
          filesWritten: Array.from(this.filesWritten)
        });

        return chatResponse;
      }

      // ────────────────────────────────────────────────────
      // CODE MODE: PHASE 1 — CHIEF PLANNER (with tool access)
      // ────────────────────────────────────────────────────
      this.options.onText?.(`\n--- \n**Chief Planner analyzing codebase and creating task graph...**\n`);

      const plannerSystemPrompt = `You are the Chief Planner. Brain of the system.
You analyze the project requirements and dependencies, read existing tree state, and decompose the user request into a step-by-step Task Graph.
You have access to read_file and list_directory tools to inspect the codebase before planning.

Workspace Directory: ${this.projectPath}

Format your final output as a single valid JSON object containing:
{
  "task": "High level task title",
  "steps": [
    "Step 1: Description of work to be done...",
    "Step 2: Description of work to be done..."
  ],
  "priority": "Critical" | "High" | "Medium" | "Low",
  "need_frontend": true|false,
  "need_backend": true|false,
  "need_database": true|false,
  "need_tests": true|false
}
Do not output any additional conversational text or emojis outside of the JSON block.`;

      const plannerMessages = [
        { role: 'system', content: plannerSystemPrompt }
      ];

      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          const role = msg.role === 'user' ? 'user' : 'assistant';
          plannerMessages.push({ role, content: msg.text || msg.content || '' });
        }
      }

      plannerMessages.push({ role: 'user', content: `Please plan the following request: "${userPrompt}"` });

      // Planner mini tool-loop: up to 5 iterations to explore the codebase
      const plannerTools = this.buildPlannerToolsArray();
      let plannerDone = false;
      let plannerIteration = 0;

      while (plannerIteration < 5 && !plannerDone) {
        if (this.cancelled) throw new Error('Task was cancelled by the user.');
        plannerIteration++;

        const plannerRes = await callLLM(plannerMessages, plannerTools, this.options.config, 'planner');

        if (plannerRes.tool_calls && plannerRes.tool_calls.length > 0) {
          plannerMessages.push({
            role: 'assistant',
            content: plannerRes.content || null,
            tool_calls: plannerRes.tool_calls
          });

          for (const tc of plannerRes.tool_calls) {
            if (this.cancelled) break;
            this.toolCallCount++;

            let args = {};
            try {
              args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
            } catch (e) {
              console.error('Planner tool arg parse error:', e);
            }

            this.options.onToolCall?.({ id: tc.id, name: tc.function.name, arguments: args });

            let result = '';
            try {
              result = await this.executeTool(tc.function.name, args);
              result = truncateResult(result);
            } catch (err) {
              result = `Error: ${err.message}`;
            }

            plannerMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
            this.options.onToolResult?.({ id: tc.id, name: tc.function.name, result });
          }
        } else {
          // Planner finished — emit the task graph
          this.options.onText?.(`### Chief Planner Task Graph:\n\`\`\`json\n${plannerRes.content}\n\`\`\`\n`);
          plannerDone = true;

          // Store final planner content for parsing below
          plannerMessages._finalContent = plannerRes.content;
        }
      }

      // If the planner used all 5 iterations without emitting a final non-tool response,
      // take the last assistant message as the plan.
      const plannerFinalContent = plannerMessages._finalContent ||
        plannerMessages.filter(m => m.role === 'assistant').pop()?.content || '{}';

      let taskGraph = { steps: [] };
      try {
        const jsonStr = extractJSON(plannerFinalContent);
        if (jsonStr) {
          taskGraph = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error('Failed to parse Planner JSON output:', e);
      }

      // ────────────────────────────────────────────────────
      // CODER & REVIEWER REFINEMENT LOOP (Up to 3 passes)
      // ────────────────────────────────────────────────────
      let reviewerPassed = false;
      let reviewPass = 0;
      let reviewerFeedback = 'Initial implementation request.';
      let builderError = null;

      while (!reviewerPassed && reviewPass < 3) {
        reviewPass++;
        if (this.cancelled) throw new Error('Task was cancelled by the user.');

        // ──────────────────────────────────────────────────
        // PHASE 2: BUILDER / CODER
        // ──────────────────────────────────────────────────
        builderError = null;

        try {
          this.options.onThinking?.({ agent: 'Coder', iteration: reviewPass });
          this.options.onText?.(`\n--- \n**Pass ${reviewPass} -- Builder / Coder implementing changes...**\n`);

          const builderSystem = `You are the Builder/Coder. Your role is purely implementation.
You read the Planner's task graph, use tools to modify files and generate code. Keep styling and variables consistent.

Workspace: ${this.projectPath}
Task Graph: ${JSON.stringify(taskGraph)}
Current Review Feedback/Target: ${reviewerFeedback}

Rules:
- You must perform coding changes by invoking read_file, edit_file, or write_file.
- Do not use emojis in your text responses.
- Verify files are written correctly.
- Work step-by-step. When done, output a summary of files written.`;

          const tools = this.buildToolsArray();
          const builderMessages = [
            { role: 'system', content: builderSystem },
            { role: 'user', content: `Please implement the planned steps. Feedback: ${reviewerFeedback}` }
          ];

          let builderIteration = 0;
          let builderDone = false;

          while (builderIteration < 15 && !builderDone) {
            if (this.cancelled) throw new Error('Task was cancelled by the user.');
            builderIteration++;

            // Compress context if nearing token budget
            compressMessages(builderMessages);

            const llmRes = await callLLM(builderMessages, tools, this.options.config, 'coder');

            if (llmRes.tool_calls && llmRes.tool_calls.length > 0) {
              builderMessages.push({
                role: 'assistant',
                content: llmRes.content || null,
                tool_calls: llmRes.tool_calls
              });

              // Parallel tool execution via Promise.allSettled
              const toolPromises = llmRes.tool_calls.map(async (tc) => {
                if (this.cancelled) {
                  return { tc, result: 'Error: Task was cancelled by the user.', error: 'Cancelled' };
                }
                this.toolCallCount++;

                let args = {};
                try {
                  args = typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments;
                } catch (e) {
                  console.error('Tool arg parse error:', e);
                }

                this.options.onToolCall?.({ id: tc.id, name: tc.function.name, arguments: args });

                let result = '';
                let error = null;
                try {
                  result = await this.executeTool(tc.function.name, args);
                  result = truncateResult(result);
                } catch (err) {
                  error = err.message;
                  result = `Error: ${err.message}`;
                }

                this.options.onToolResult?.({
                  id: tc.id,
                  name: tc.function.name,
                  result: error ? null : result,
                  error
                });

                return { tc, result, error };
              });

              const toolResults = await Promise.allSettled(toolPromises);

              // Push all results into builderMessages in order
              for (const settled of toolResults) {
                const outcome = settled.status === 'fulfilled'
                  ? settled.value
                  : { tc: { id: 'unknown' }, result: `Error: ${settled.reason}`, error: String(settled.reason) };
                builderMessages.push({
                  role: 'tool',
                  tool_call_id: outcome.tc.id,
                  content: outcome.result
                });
              }
            } else {
              // Builder finished implementation turn
              this.options.onText?.(llmRes.content);
              builderDone = true;
            }
          }
        } catch (err) {
          builderError = err;
          this.options.onText?.(`\nBuilder encountered an error: ${err.message}. Attempting to continue...\n`);
        }

        // Get modifications for Reviewer
        let activeDiff = '';
        try {
          activeDiff = await git_diff(this.projectPath, { getConfig: () => this.options.config });
        } catch (diffErr) {
          activeDiff = `(Could not retrieve diff: ${diffErr.message})`;
        }

        // ──────────────────────────────────────────────────
        // PHASE 3: REVIEWER / QA
        // ──────────────────────────────────────────────────
        this.options.onThinking?.({ agent: 'Reviewer', iteration: reviewPass });
        this.options.onText?.(`\n--- \n**Reviewer / QA analyzing changes...**\n`);

        const reviewerSystem = `You are the Reviewer/QA. You analyze and criticize the Builder's changes.
You check for security vulnerabilities, memory leaks, performance bugs, code smells, unused imports, or duplicate logic.
You do NOT generate code or modify files.

Format your final response as a valid JSON object:
{
  "status": "PASS" | "FAIL",
  "issues": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "message": "Specific explanation of the bug and how to fix it."
    }
  ]
}
Do not output any additional conversational text or emojis outside of the JSON block.`;

        const reviewerRes = await callLLM([
          { role: 'system', content: reviewerSystem },
          { role: 'user', content: `Please review these modifications:\n\`\`\`diff\n${activeDiff}\n\`\`\`` }
        ], null, this.options.config, 'reviewer');

        this.options.onText?.(`### Reviewer Feedback:\n\`\`\`json\n${reviewerRes.content}\n\`\`\`\n`);

        let reviewResult = { status: 'PASS', issues: [] };
        try {
          const jsonStr = extractJSON(reviewerRes.content);
          if (jsonStr) {
            reviewResult = JSON.parse(jsonStr);
          }
        } catch (e) {
          console.error('Reviewer JSON parse error:', e);
        }

        if (reviewResult.status === 'PASS' || reviewResult.issues.length === 0) {
          reviewerPassed = true;
          this.options.onText?.(`\n**Reviewer Passed!** No critical issues detected.\n`);
        } else {
          reviewerFeedback = JSON.stringify(reviewResult.issues);
          this.options.onText?.(`\n**Reviewer Failed!** Builder needs to address the issues above.\n`);
        }
      }

      // ────────────────────────────────────────────────────
      // PHASE 4: FINAL INTEGRATOR
      // ────────────────────────────────────────────────────
      this.options.onThinking?.({ agent: 'Integrator', iteration: 1 });
      this.options.onText?.(`\n--- \n**Integrator finalizing response...**\n`);

      const integratorSystem = `You are the Final Integrator/Architect. You summarize the changes made, resolve any pending code imports, verify the workspace compiles successfully, and write a unified response to the user.

Workspace: ${this.projectPath}
Task requested: ${userPrompt}
Reviewer Passed: ${reviewerPassed ? 'Yes' : 'No'}
${builderError ? `Builder Error: ${builderError.message}` : ''}

Write a complete, structured summary of what files were added/edited, and explain how the implementation works. Do not use emojis in your response.`;

      const integratorRes = await callLLM([
        { role: 'system', content: integratorSystem },
        { role: 'user', content: 'Generate final synthesis.' }
      ], null, this.options.config, 'integrator');

      integratorContent = integratorRes.content;
      this.options.onText?.(integratorContent);

      this.options.onDone?.({
        success: true,
        duration: Date.now() - this.startTime,
        toolCalls: this.toolCallCount,
        filesRead: Array.from(this.filesRead),
        filesWritten: Array.from(this.filesWritten)
      });

      return integratorContent;
    } catch (err) {
      this.options.onError?.(err.message);
      this.options.onDone?.({
        success: false,
        error: err.message,
        duration: Date.now() - this.startTime,
        toolCalls: this.toolCallCount
      });
      throw err;
    } finally {
      // Auto-save conversation to session
      try {
        addSessionMessage(this.projectPath, 'user', userPrompt);
        if (integratorContent) {
          addSessionMessage(this.projectPath, 'assistant', integratorContent);
        }
      } catch (e) {
        console.error('Failed to save session:', e);
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // Tool Definitions
  // ──────────────────────────────────────────────────────

  /**
   * Planner-only tools: read_file and list_directory for codebase exploration.
   */
  buildPlannerToolsArray() {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the text content of a file in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the file.' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List contents (files and directories) in a given workspace directory.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the directory. Default is "."' }
            }
          }
        }
      }
    ];
  }

  /**
   * Full builder tools array: all 13 tools available during implementation.
   */
  buildToolsArray() {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the text content of a file in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the file.' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write complete content to a file, creating folders if needed.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the file.' },
              content: { type: 'string', description: 'Content string.' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Perform a precise text replacement in an existing file.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the file.' },
              old_string: { type: 'string', description: 'The exact substring search content.' },
              new_string: { type: 'string', description: 'The replacement content.' }
            },
            required: ['path', 'old_string', 'new_string']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List contents (files and directories) in a given workspace directory.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the directory. Default is "."' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description: 'Search for a pattern matching within files across the workspace.',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Regex query string.' },
              path: { type: 'string', description: 'Relative path scope. Default is "."' }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_file',
          description: 'Delete a file from the workspace.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the file.' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Run a shell command in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The shell command.' }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_status',
          description: 'Display git status.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_diff',
          description: 'Display the git diff.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_commit',
          description: 'Create a git commit.',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Commit message.' }
            },
            required: ['message']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_log',
          description: 'Display recent git commits.',
          parameters: {
            type: 'object',
            properties: {
              count: { type: 'number', description: 'Number of commits. Default is 10.' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_branch',
          description: 'List all git branches.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web using Tavily Search API.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The web search query.' }
            },
            required: ['query']
          }
        }
      }
    ];
  }

  // ──────────────────────────────────────────────────────
  // Tool Execution
  // ──────────────────────────────────────────────────────

  async executeTool(name, args) {
    /**
     * Resolve a relative path against the workspace root.
     * Prevents path-traversal attacks by ensuring the resolved path
     * stays within the project directory.
     */
    const resolvePath = (relPath) => {
      if (!relPath) return this.projectPath;
      const cleaned = relPath.replace(/^[/\\]+/, '');
      const resolved = path.resolve(this.projectPath, cleaned);
      if (!resolved.startsWith(this.projectPath)) {
        throw new Error(`Access denied: path escapes workspace.`);
      }
      return resolved;
    };

    const context = {
      getConfig: () => this.options.config,
      approve: async (type, details) => {
        if (this.options.approve) {
          return await this.options.approve({ type, details });
        }
        return false;
      },
      onStdout: (data) => this.options.onStdout?.(data),
      onStderr: (data) => this.options.onStderr?.(data)
    };

    switch (name) {
      case 'read_file': {
        const file = resolvePath(args.path);
        this.filesRead.add(args.path);
        return await read_file(file);
      }
      case 'write_file': {
        const file = resolvePath(args.path);
        this.filesWritten.add(args.path);
        return await write_file(file, args.content, context);
      }
      case 'edit_file': {
        const file = resolvePath(args.path);
        this.filesWritten.add(args.path);
        return await edit_file(file, args.old_string, args.new_string, context);
      }
      case 'list_directory': {
        const dir = resolvePath(args.path);
        const list = await list_directory(dir);
        return JSON.stringify(list, null, 2);
      }
      case 'search_files': {
        const dir = resolvePath(args.path);
        const matches = await search_files(args.pattern, dir);
        return JSON.stringify(matches, null, 2);
      }
      case 'delete_file': {
        const file = resolvePath(args.path);
        return await delete_file(file, context);
      }
      case 'execute_command': {
        const res = await execute_command(args.command, this.projectPath, context);
        return `Exit Code: ${res.code}\nStdout:\n${res.stdout}\nStderr:\n${res.stderr}`;
      }
      case 'git_status': {
        return await git_status(this.projectPath, context);
      }
      case 'git_diff': {
        return await git_diff(this.projectPath, context);
      }
      case 'git_commit': {
        return await git_commit(args.message, this.projectPath, context);
      }
      case 'git_log': {
        return await git_log(this.projectPath, args.count, context);
      }
      case 'git_branch': {
        return await git_branch(this.projectPath, context);
      }
      case 'web_search': {
        const searchRes = await web_search(args.query);
        return `Answer: ${searchRes.answer}\nResults:\n${JSON.stringify(searchRes.results, null, 2)}`;
      }
      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  }
}
