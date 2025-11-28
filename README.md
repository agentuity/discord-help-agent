# DiscordHelp

An intelligent Discord bot that provides automated support for Agentuity by triaging user questions and creating Slack tickets for technical issues.

## What It Does

DiscordHelp is a multi-agent system that:

- 🤖 **Monitors Discord messages** - Automatically processes questions in your Discord server
- 🎯 **Intelligent triage** - Uses AI to categorize requests and determine the best action
- 📚 **Documentation search** - Searches Agentuity docs to answer common questions
- 🎫 **Slack ticket creation** - Creates support tickets in Slack for technical issues requiring staff attention
- 👥 **Staff escalation** - Alerts staff members for bugs and errors that need immediate attention

## How It Works

The system uses three specialized agents:

1. **Help Agent** (`/agents/help`) - Orchestrator that triages incoming Discord messages:
   - Detects technical issues and creates Slack tickets
   - Routes documentation questions to the docs agent
   - Escalates bugs to staff members
   - Ignores irrelevant messages

2. **Docs Agent** (`/agents/docs`) - Searches Agentuity documentation:
   - Fetches latest docs from agentuity.dev/llms.txt
   - Uses Claude Sonnet to find relevant answers
   - Returns helpful responses for how-to questions

3. **Slack Agent** (`/agents/slack`) - Creates support tickets:
   - Formats issues for Slack threads
   - Posts to designated Slack channel
   - Generates user acknowledgment messages

## Project Structure

```
discordhelp/
├── src/
│   ├── agents/
│   │   ├── help/        # Main orchestrator agent
│   │   ├── docs/        # Documentation search agent
│   │   └── slack/       # Slack ticket creation agent
│   └── apis/            # Custom API routes (if needed)
├── app.ts               # Application entry point
├── .env                 # Environment variables (see .env.example)
└── package.json         # Dependencies and scripts
```

## Available Commands

After creating your project, you can run:

### Development

```bash
bun run dev
```

Starts the development server at http://localhost:3500

### Build

```bash
bun run build
```

Compiles your application into the `.agentuity/` directory

### Type Check

```bash
bun run typecheck
```

Runs TypeScript type checking

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
AGENTUITY_SDK_KEY=your-agentuity-key
DISCORD_BOT_TOKEN=your-discord-bot-token
SLACK_BOT_TOKEN=your-slack-bot-token
```

### Slack Channel

The Slack channel ID is configured in `src/agents/slack/agent.ts`. Update the `SLACK_CHANNEL_ID` constant to point to your support channel.

## Deployment

Deploy to Agentuity cloud:

```bash
bun run deploy
```

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)

## Requirements

- [Bun](https://bun.sh/) v1.0 or higher
- TypeScript 5+

## License

Apache 2.0
