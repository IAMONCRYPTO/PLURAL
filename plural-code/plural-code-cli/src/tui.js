import readline from 'readline';
import chalk from 'chalk';
import path from 'path';
import { 
  AgentOrchestrator, 
  getConfig, 
  saveConfig, 
  git, 
  search,
  clearSessionHistory 
} from 'plural-code-core';

let rlInstance = null;

function renderHeader(projectPath) {
  const config = getConfig();
  const projectName = path.basename(projectPath);
  
  console.log(chalk.bold.purple('┌──────────────────────────────────────────────────────────┐'));
  console.log(chalk.bold.purple(`│ PLURAL CODE  -  Many minds. One codebase.                │`));
  console.log(chalk.bold.purple(`│ Provider: ${config.provider.toUpperCase().padEnd(10)}              Project: ${projectName.substring(0, 15).padEnd(15)} │`));
  console.log(chalk.bold.purple('└──────────────────────────────────────────────────────────┘'));
}

function showHelp() {
  console.log(chalk.bold('\nAvailable commands (No emojis allowed):'));
  console.log(`  ${chalk.cyan('/model <agent> <model-id>')}   - Change model for an agent (planner, coder, etc.)`);
  console.log(`  ${chalk.cyan('/provider <nvidia|openrouter>')} - Switch default active provider`);
  console.log(`  ${chalk.cyan('/search <query>')}             - Trigger standard web search`);
  console.log(`  ${chalk.cyan('/research <query>')}           - Trigger deep research summary`);
  console.log(`  ${chalk.cyan('/diff')}                       - Show local changes diff`);
  console.log(`  ${chalk.cyan('/commit "<message>"')}         - Commit changes to Git`);
  console.log(`  ${chalk.cyan('/clear')}                      - Reset workspace context history`);
  console.log(`  ${chalk.cyan('/help')}                       - Show help details`);
  console.log(`  ${chalk.cyan('/exit')}                       - Exit Plural Code interactive shell\n`);
}

async function promptConfirmation(promptMsg) {
  const tempRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    tempRl.question(chalk.yellow(`\n[WARNING] ${promptMsg} Confirm? (y/N): `), answer => {
      tempRl.close();
      const confirmed = answer.toLowerCase().trim() === 'y';
      resolve(confirmed);
    });
  });
}

export function startInteractiveTui(projectPath) {
  renderHeader(projectPath);
  console.log(chalk.gray('Type your request below, or type /help for commands.'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('\n> ')
  });
  rlInstance = rl;

  const runnerContext = {
    approve: async (type, details) => {
      // Temporarily pause prompt
      rl.pause();
      let confirmed = false;
      if (type === 'execute_command') {
        confirmed = await promptConfirmation(`System is about to run terminal command: "${details.command}".`);
      } else if (type === 'delete_file') {
        confirmed = await promptConfirmation(`System is about to delete file: "${details.path}".`);
      } else if (type === 'write_file' || type === 'edit_file') {
        confirmed = await promptConfirmation(`System is writing/modifying file: "${details.path}".`);
      }
      rl.resume();
      return confirmed;
    },
    onStdout: (data) => {
      process.stdout.write(data);
    },
    onStderr: (data) => {
      process.stderr.write(chalk.red(data));
    },
    onActivity: ({ agent, message }) => {
      const colors = {
        Planner: chalk.magenta,
        Coder: chalk.cyan,
        Reviewer: chalk.yellow,
        Executor: chalk.blue,
        Synthesizer: chalk.green
      };
      const colorFn = colors[agent] || chalk.white;
      console.log(`\n${colorFn(`[${agent}]`)} ${message}`);
    }
  };

  const orchestrator = new AgentOrchestrator(projectPath, runnerContext);

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/exit') {
        rl.close();
        return;
      }

      if (cmd === '/help') {
        showHelp();
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        clearSessionHistory(projectPath);
        console.log(chalk.green('[Success] Workspace session context cleared.'));
        rl.prompt();
        return;
      }

      if (cmd === '/provider') {
        const prov = parts[1]?.toLowerCase();
        if (prov === 'nvidia' || prov === 'openrouter') {
          const config = getConfig();
          config.provider = prov;
          saveConfig(config);
          console.log(chalk.green(`[Success] Switched active provider to: ${prov}`));
        } else {
          console.log(chalk.red('[Error] Usage: /provider <nvidia|openrouter>'));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/model') {
        const agent = parts[1]?.toLowerCase();
        const modelId = parts[2];
        const config = getConfig();
        if (agent && modelId && config.agent_models[agent] !== undefined) {
          config.agent_models[agent] = modelId;
          saveConfig(config);
          console.log(chalk.green(`[Success] Updated model for ${agent} to: ${modelId}`));
        } else {
          console.log(chalk.red('[Error] Usage: /model <planner|coder|reviewer|executor|synthesizer> <model-id>'));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/diff') {
        console.log(chalk.gray('\nCalculating workspace diffs...'));
        try {
          const diffText = await git.git_diff(projectPath, runnerContext);
          console.log(diffText);
        } catch (e) {
          console.log(chalk.red(`Error generating diff: ${e.message}`));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/commit') {
        const match = input.match(/\/commit\s+"([^"]+)"/);
        if (match && match[1]) {
          console.log(chalk.gray('\nCommitting changes to branch...'));
          try {
            const commitRes = await git.git_commit(match[1], projectPath, runnerContext);
            console.log(commitRes);
          } catch (e) {
            console.log(chalk.red(`Commit failed: ${e.message}`));
          }
        } else {
          console.log(chalk.red('[Error] Usage: /commit "<commit message>" (Ensure message is in quotes)'));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/search') {
        const query = parts.slice(1).join(' ');
        if (query) {
          console.log(chalk.gray(`\nPerforming search for: "${query}"...`));
          try {
            const res = await search.web_search(query);
            console.log(chalk.green(`\nAnswer: ${res.answer}`));
            console.log(chalk.bold('\nSources:'));
            res.results.forEach(r => console.log(`- ${r.title} (${r.url})`));
          } catch (e) {
            console.log(chalk.red(`Search failed: ${e.message}`));
          }
        } else {
          console.log(chalk.red('[Error] Usage: /search <query>'));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/research') {
        const query = parts.slice(1).join(' ');
        if (query) {
          try {
            const res = await search.deep_research(query, (progress) => {
              console.log(chalk.yellow(`[Research Progress] ${progress}`));
            });
            console.log(chalk.green('\n======================================'));
            console.log(chalk.bold('DEEP RESEARCH REPORT'));
            console.log(chalk.green('======================================'));
            console.log(res.report);
          } catch (e) {
            console.log(chalk.red(`Research failed: ${e.message}`));
          }
        } else {
          console.log(chalk.red('[Error] Usage: /research <query>'));
        }
        rl.prompt();
        return;
      }

      console.log(chalk.red(`[Error] Unknown command: ${cmd}`));
      rl.prompt();
      return;
    }

    // Process general agent request
    try {
      await orchestrator.processRequest(input);
    } catch (e) {
      console.log(chalk.red(`\n[Execution Error] ${e.message}`));
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.cyan('\nGoodbye from Plural Code.'));
    process.exit(0);
  });
}
