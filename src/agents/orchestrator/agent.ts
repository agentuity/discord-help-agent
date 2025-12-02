import { type AgentContext, createAgent } from "@agentuity/runtime";
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

- If the conversation is too complicated or prolong itself set action to with "createGithubIssue" with a summary of the whole conversation and issue on the message.
- If the message is relevant to Agentuity and the user needs help with documentation or how-to questions, set action to "searchDocs" with a prompt for the docs agent.
- If the message is about a bug, error, or technical issue that requires staff attention, set action to "respond" with the message: "I don't think I can help with this technical issue, but <@&1334347052397887619> should be able to take a look into it!"
- If the content has no relevance to Agentuity or has no issues, set action to "ignore" with an empty message.
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

		const { object } = await generateObject({
			model: groq("openai/gpt-oss-20b"),
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
					message: object.message,
				});
				return {
					message: agentResponse.userResponse,
					metadata: { messageId: latestMessage.id },
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
