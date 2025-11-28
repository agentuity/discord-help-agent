import { createAgent } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const SLACK_CHANNEL_ID = "C08300M9D49";

export const inputSchema = z.object({
	metadata: z.object({
		username: z.string(),
		channelId: z.string(),
		isThread: z.boolean().optional(),
	}),
	message: z.string(),
});

const outputSchema = z.object({
	slackMessage: z.string(),
	userResponse: z.string(),
});

const systemPrompt = `
You are an agent responsible for formatting issues for a Slack thread and generating user responses.

You will receive a message from a user and you will:
1. Format it in a way that makes sense for a Slack thread (slackMessage)
2. Generate a response to send back to the user acknowledging the ticket was created (userResponse)
`;

const agent = createAgent({
	metadata: {
		name: "slack",
		description: "Add your agent description here",
	},
	schema: {
		input: inputSchema,
		output: outputSchema,
	},
	handler: async (c, input) => {
		const prompt = `
    Username: ${input.metadata.username}
    Message: ${input.message}
    `;
		const { object } = await generateObject({
			model: anthropic("claude-haiku-4-5"),
			schema: outputSchema,
			messages: [{ role: "user", content: prompt }],
			system: systemPrompt,
		});

		// Post to Slack channel as a new thread
		const slackToken = process.env.SLACK_BOT_TOKEN;
		if (slackToken) {
			try {
				const response = await fetch("https://slack.com/api/chat.postMessage", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${slackToken}`,
					},
					body: JSON.stringify({
						channel: SLACK_CHANNEL_ID,
						text: object.slackMessage,
						username: input.metadata.username,
					}),
				});

				const data = await response.json();
				if (!data.ok) {
					c.logger.error("Failed to post to Slack: %s", data.error);
				} else {
					c.logger.info("Posted to Slack thread: %s", data.ts);
				}
			} catch (error) {
				c.logger.error("Error posting to Slack: %s", error);
			}
		}

		return object;
	},
});

export default agent;