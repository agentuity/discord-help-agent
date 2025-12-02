import { createAgent } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export const inputSchema = z.object({
	metadata: z.object({
		username: z.string(),
		channelId: z.string(),
		guildId: z.string(),
		isThread: z.boolean().optional(),
	}),
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
	issueTitle: z.string(),
	issueBody: z.string(),
	userResponse: z.string(),
	repository: z.enum(["agentuity/app", "agentuity/sdk"]),
	issueUrl: z.string().optional(),
	shouldCloseThread: z.boolean(),
});

const systemPrompt = `
You are an agent responsible for creating GitHub issues from Discord support requests.

You will receive a message from a user and you will:
1. Create a concise, descriptive title for the GitHub issue (issueTitle)
2. Format the issue details in markdown for the GitHub issue body (issueBody)
3. Generate a professional acknowledgment message for the user (userResponse) - write a complete message thanking them and explaining the issue has been created. The GitHub issue URL will be automatically appended to your message.
4. Determine the appropriate repository:
   - Use "agentuity/app" for website-related issues
   - Use "agentuity/sdk" for project-related issues
5. Set shouldCloseThread to true if this is a thread that should be closed after the issue is created
`;

const agent = createAgent({
	metadata: {
		name: "github",
		description: "Creates GitHub issues from Discord help requests",
	},
	schema: {
		input: inputSchema,
		output: outputSchema,
	},
	handler: async (c, input) => {
		const conversationHistory = input.messages
			.map((msg) => {
				let msgText = `[${msg.timestamp}] ${msg.author.username}: ${msg.content}`;
				if (msg.images && msg.images.length > 0) {
					msgText += `\nImages: ${msg.images.join(", ")}`;
				}
				return msgText;
			})
			.join("\n");

		const prompt = `
    Username: ${input.metadata.username}
    Conversation History:
    ${conversationHistory}
    `;
		const { object } = await generateObject({
			model: anthropic("claude-haiku-4-5"),
			schema: outputSchema,
			messages: [{ role: "user", content: prompt }],
			system: systemPrompt,
		});

		// Create GitHub issue
		const githubToken = process.env.GITHUB_TOKEN;
		let issueUrl: string | undefined;

		if (githubToken) {
			try {
				const response = await fetch(
					`https://api.github.com/repos/${object.repository}/issues`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${githubToken}`,
							"X-GitHub-Api-Version": "2022-11-28",
						},
						body: JSON.stringify({
							title: object.issueTitle,
							body: `${object.issueBody}\n\n---\n**Reported by:** ${input.metadata.username}\n**Discord Thread:** https://discord.com/channels/${input.metadata.guildId}/${input.metadata.channelId}`,
							labels: ["discord-support"],
						}),
					},
				);

				const data = await response.json();
				if (!response.ok) {
					c.logger.error("Failed to create GitHub issue: %s", data.message);
				} else {
					issueUrl = data.html_url;
					c.logger.info(
						"Created GitHub issue #%d: %s",
						data.number,
						data.html_url,
					);
				}
			} catch (error) {
				c.logger.error("Error creating GitHub issue: %s", error);
			}
		}

		return {
			...object,
			issueUrl,
			userResponse: issueUrl
				? `${object.userResponse}\n\nIssue: ${issueUrl}`
				: object.userResponse,
		};
	},
});

export default agent;