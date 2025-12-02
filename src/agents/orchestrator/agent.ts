import { type AgentContext, createAgent } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
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
	channelId: z.string(),
	guildId: z.string(),
	isThread: z.boolean(),
});

const outputSchema = z.object({
	metadata: z
		.object({
			messageId: z.string(),
			shouldCloseThread: z.boolean().optional(),
		})
		.optional(),
	message: z.string(),
});

const agentOutputSchema = z.object({
	message: z.string(),
	action: z.enum(["searchDocs", "respond", "createGithubIssue", "ignore"]),
});

const systemPrompt = `
You are an orchestrator that triages questions related to Agentuity.

The user will provide you with a Discord message and you will decide what action to take:

- If the conversation is too complicated, prolonged, or involves a bug/error/technical issue that requires staff attention, set action to "createGithubIssue" with a summary of the whole conversation and issue on the message.
- If the message is relevant to Agentuity and the user needs help with documentation or how-to questions, set action to "searchDocs" with a prompt for the docs agent.
- If this is a standalone message (not part of a conversation) and has no relevance to Agentuity or has no issues, set action to "ignore" with an empty message. However, if this is part of an ongoing conversation, continue to engage even if the latest message seems less relevant.
`;

const agent = createAgent({
	metadata: {
		name: "orchestrator",
		description: "This is an orchestrator for the slack help system.",
	},
	schema: {
		input: inputSchema,
		output: outputSchema,
	},
	handler: async (c: AgentContext, input) => {
		const latestMessage = input.messages[input.messages.length - 1];
		if (!latestMessage) {
			throw new Error("No messages in input");
		}

		const formattedMessages = input.messages.map((msg) => ({
			role: msg.isBot ? ("assistant" as const) : ("user" as const),
			content: `${msg.author.username}: ${msg.content}`,
		}));

		c.logger.info(
			`Received ${input.messages.length} messages from ${input.isThread ? "thread" : "channel"}`,
		);

		const hasImage = input.messages.some(
			(msg) => msg.images && msg.images.length > 0,
		);

		const { object } = await generateObject({
			model: hasImage
				? anthropic("claude-haiku-4-5")
				: groq("openai/gpt-oss-20b"),
			schema: agentOutputSchema,
			system: systemPrompt,
			messages: formattedMessages,
		});

		c.logger.info("Generated response with action: %s", object.action);

		switch (object.action) {
			case "searchDocs": {
				const agentResponse = await c.agent.docs.run({
					messages: input.messages,
				});
				return {
					message: agentResponse.message,
					metadata: { messageId: latestMessage.id },
				};
			}
			case "createGithubIssue": {
				const agentResponse = await c.agent.github.run({
					metadata: {
						username: latestMessage.author.username,
						channelId: input.channelId,
						guildId: input.guildId,
						isThread: input.isThread,
					},
					messages: input.messages,
				});
				return {
					message: agentResponse.userResponse,
					metadata: {
						messageId: latestMessage.id,
						shouldCloseThread: agentResponse.shouldCloseThread,
					},
				};
			}
			case "respond":
				return {
					message: object.message,
					metadata: { messageId: latestMessage.id },
				};
			default:
				return {
					message: "I don't know how to help with that.",
					metadata: { messageId: latestMessage.id },
				};
		}
	},
});

export default agent;
