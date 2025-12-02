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
	message: z.string(),
});

const outputSchema = z.object({
	issueTitle: z.string(),
	issueBody: z.string(),
	userResponse: z.string(),
	repository: z.enum(["agentuity/app", "agentuity/sdk"]),
});

const systemPrompt = `
You are an agent responsible for creating GitHub issues from Discord support requests.

You will receive a message from a user and you will:
1. Create a concise, descriptive title for the GitHub issue (issueTitle)
2. Format the issue details in markdown for the GitHub issue body (issueBody)
3. Generate a response to send back to the user acknowledging the issue was created (userResponse)
4. Determine the appropriate repository:
   - Use "agentuity/app" for website-related issues
   - Use "agentuity/sdk" for project-related issues
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

		// Create GitHub issue
		const githubToken = process.env.GITHUB_TOKEN;
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

		return object;
	},
});

export default agent;

