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
			images: z.array(z.string()).optional(),
		}),
	),
});

const outputSchema = z.object({
	message: z.string(),
});

const systemPrompt = `
Your job is to search the Agentuity docs to find answers to a question.

Keep your answers short and concise. Prefering to link to resources instead of saying everything outright.

If no answer is found, you should say "Sorry, I couldn't find an answer to that question."
`;

const docsAgent = createAgent("Docs", {
	description: "Search the Agentuity docs for answers to a question",
	schema: {
		input: inputSchema,
		output: outputSchema,
	},
	handler: async (_c: AgentContext, input) => {
		const formattedMessages = input.messages.map((msg) => {
			const textContent = `${msg.author.username}: ${msg.content}`;
			const role = msg.isBot ? "assistant" : "user";

			// Only user messages can have images in AI SDK
			if (role === "user" && msg.images && msg.images.length > 0) {
				return {
					role: "user" as const,
					content: [
						{ type: "text" as const, text: textContent },
						...msg.images.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				};
			}

			if (role === "assistant") {
				return {
					role: "assistant" as const,
					content: textContent,
				};
			}
			return {
				role: "user" as const,
				content: textContent,
			};
		});

		const docsResponse = await fetch("https://agentuity.dev/llms.txt");

		if (!docsResponse.ok) {
			throw new Error("Failed to fetch docs");
		}

		const { text } = await generateText({
			model: anthropic("claude-sonnet-4-5"),
			messages: formattedMessages,
			system: `${systemPrompt}\n\nHere's the agentuity docs: ${await docsResponse.text()}`,
		});

		return { message: text };
	},
});

export default docsAgent;
