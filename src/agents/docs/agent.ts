import { type AgentContext, createAgent } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";

export const inputSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string(),
			content: z.string(),
			timestamp: z.string(),
			isBot: z.boolean(),
			author: z.object({
				id: z.string(),
				username: z.string(),
				global_name: z.string().optional(),
			}),
		}),
	),
});

const outputSchema = z.object({
	message: z.string(),
});

const systemPrompt = `
Your job is to search the Agentuity docs to find answers to a question.

If no answer is found, you should say "Sorry, I couldn't find an answer to that question."
`;

const docsAgent = createAgent({
	metadata: {
		name: "docs",
		description: "Searches the Agentuity docs for answers to questions",
	},
	schema: {
		input: inputSchema,
		output: outputSchema,
	},
	handler: async (_c: AgentContext, input) => {
		const formattedMessages = input.messages.map((msg) => ({
			role: msg.isBot ? ("assistant" as const) : ("user" as const),
			content: `${msg.author.username}: ${msg.content}`,
		}));

		const docsResponse = await fetch("https://agentuity.dev/llms.txt");

		if (!docsResponse.ok) {
			throw new Error("Failed to fetch docs");
		}

		const { text } = await generateText({
			model: anthropic("claude-sonnet-4-5"),
			messages: formattedMessages,
			system: `${systemPrompt}\n\nHere's the agentuity docs: ${docsResponse.text()}`,
		});

		return { message: text };
	},
});

export default docsAgent;

