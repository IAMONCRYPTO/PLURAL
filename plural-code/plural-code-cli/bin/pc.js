#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';

import { 
  getConfig, 
  saveConfig, 
  setApiKey, 
  deleteApiKey 
} from 'plural-code-core';
import { startInteractiveTui } from '../src/tui.js';

const program = new Command();

program
  .name('pc')
  .description('Plural Code - Many minds. One codebase.')
  .version('1.0.0');

// 1. Initial configuration wizard subcommand
program
  .command('init')
  .description('Configure API keys and model provider setups for Plural Code')
  .action(async () => {
    console.log(chalk.bold.magenta('\n======================================================'));
    console.log(chalk.bold.magenta(' PLURAL CODE INITIALIZATION WIZARD '));
    console.log(chalk.bold.magenta('======================================================\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'nvidiaKey',
        message: 'Enter your NVIDIA NIM API Key (primary):',
        validate: input => input.trim() ? true : 'Key cannot be empty.'
      },
      {
        type: 'input',
        name: 'openrouterKey',
        message: 'Enter your OpenRouter API Key (optional, press Enter to skip):'
      },
      {
        type: 'input',
        name: 'tavilyKey',
        message: 'Enter your Tavily Web Search API Key (optional, press Enter to skip):'
      }
    ]);

    await setApiKey('nvidia', answers.nvidiaKey.trim());
    
    if (answers.openrouterKey.trim()) {
      await setApiKey('openrouter', answers.openrouterKey.trim());
    } else {
      await deleteApiKey('openrouter');
    }

    if (answers.tavilyKey.trim()) {
      await setApiKey('tavily', answers.tavilyKey.trim());
    } else {
      await deleteApiKey('tavily');
    }

    console.log(chalk.green('\n[Success] API Keys saved successfully in secure credentials manager!'));
    console.log(chalk.cyan(`Config file created/verified under ~/.pluralcode/config.json\n`));
  });

// 2. Configuration settings set-model / set-provider subcommands
const configCmd = program.command('config').description('Configure model maps and default settings');

configCmd
  .command('set-model')
  .description('Set target model for an agent')
  .argument('<agent>', 'agent name (planner, coder, reviewer, executor, synthesizer)')
  .argument('<modelId>', 'the dynamic model id (e.g. deepseek-ai/deepseek-v3.1)')
  .action((agent, modelId) => {
    const config = getConfig();
    const cleanAgent = agent.toLowerCase();
    
    if (!config.agent_models[cleanAgent]) {
      console.error(chalk.red(`[Error] Invalid agent role: ${agent}. Available: planner, coder, reviewer, executor, synthesizer`));
      process.exit(1);
    }

    config.agent_models[cleanAgent] = modelId;
    saveConfig(config);
    console.log(chalk.green(`[Success] Set model for ${cleanAgent} to: ${modelId}`));
  });

configCmd
  .command('set-provider')
  .description('Set active default provider (nvidia or openrouter)')
  .argument('<provider>', 'nvidia or openrouter')
  .action((provider) => {
    const config = getConfig();
    const cleanProvider = provider.toLowerCase();

    if (cleanProvider !== 'nvidia' && cleanProvider !== 'openrouter') {
      console.error(chalk.red('[Error] Provider must be either "nvidia" or "openrouter".'));
      process.exit(1);
    }

    config.provider = cleanProvider;
    saveConfig(config);
    console.log(chalk.green(`[Success] Switched active provider to: ${cleanProvider}`));
  });

// 3. Default action: launch Interactive TUI
program
  .action(() => {
    const projectPath = process.cwd();
    startInteractiveTui(projectPath);
  });

program.parse(process.argv);
