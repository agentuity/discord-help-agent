import type { Logger } from "@agentuity/core";
import type { Hono } from "hono";

const HELP_KEYWORDS = [
	"help",
	"issue",
	"problem",
	"error",
	"bug",
	"broken",
	"not working",
	"can't",
	"cannot",
	"doesn't work",
	"stuck",
	"question",
	"agentuity",
];

interface GatewayPayload {
	op: number;
	d: unknown;
	s: number | null;
	t: string | null;
}

export interface DiscordMessage {
	id: string;
	type: number;
	content: string;
	channel_id: string;
	channel_type: number;
	author: {
		id: string;
		username: string;
		discriminator: string;
		global_name?: string;
		avatar?: string;
		bot?: boolean;
	};
	attachments: Array<{
		id: string;
		filename: string;
		size: number;
		url: string;
		proxy_url: string;
		content_type?: string;
		width?: number;
		height?: number;
	}>;
	embeds: unknown[];
	mentions: Array<{ id: string; username: string; bot?: boolean }>;
	mention_roles: string[];
	pinned: boolean;
	mention_everyone: boolean;
	tts: boolean;
	timestamp: string;
	edited_timestamp: string | null;
	flags: number;
	components?: unknown[];
	nonce?: string;
	guild_id?: string;
	member?: unknown;
	message_reference?: {
		message_id: string;
		channel_id: string;
		guild_id?: string;
	};
}

export interface ProcessedMessage {
	id: string;
	content: string;
	timestamp: string;
	isBot: boolean;
	author: {
		id: string;
		username: string;
		global_name?: string;
	};
	images?: string[];
}

export interface ThreadMessagesPayload {
	messages: ProcessedMessage[];
	channelId: string;
	guildId: string;
	isThread: boolean;
}

export class DiscordGateway {
	private ws: WebSocket | null = null;
	private heartbeatInterval: Timer | null = null;
	private sequenceNumber: number | null = null;
	private sessionId: string | null = null;
	private botUserId: string | null = null;
	private token: string;
	private router: Hono;
	private logger: Logger;
	static GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

	constructor(token: string, router: Hono, logger: Logger) {
		this.token = token;
		this.router = router;
		this.logger = logger;
	}

	connect() {
		this.ws = new WebSocket(DiscordGateway.GATEWAY_URL);

		this.ws.onopen = () => {
			this.logger.info("Connected to Discord Gateway");
		};

		this.ws.onmessage = (event) => {
			const payload: GatewayPayload = JSON.parse(event.data as string);
			this.handlePayload(payload);
		};

		this.ws.onerror = (error) => {
			this.logger.error("Gateway error:", error);
		};

		this.ws.onclose = (event) => {
			this.logger.info("Gateway closed: %d %s", event.code, event.reason);
			this.cleanup();
		};
	}

	private handlePayload(payload: GatewayPayload) {
		if (payload.s !== null) {
			this.sequenceNumber = payload.s;
		}

		switch (payload.op) {
			case 10: // Hello
				this.handleHello(payload.d as { heartbeat_interval: number });
				break;
			case 0: // Dispatch
				this.handleDispatch(payload);
				break;
			case 11: // Heartbeat ACK
				this.logger.debug("Heartbeat acknowledged");
				break;
		}
	}

	private handleHello(data: { heartbeat_interval: number }) {
		this.logger.info(
			"Received Hello, heartbeat interval: %d",
			data.heartbeat_interval,
		);
		this.startHeartbeat(data.heartbeat_interval);
		this.identify();
	}

	private async handleDispatch(payload: GatewayPayload) {
		switch (payload.t) {
			case "READY": {
				const readyData = payload.d as {
					session_id: string;
					user: { id: string };
				};
				this.sessionId = readyData.session_id;
				this.botUserId = readyData.user.id;
				this.logger.info(
					"Gateway ready, session: %s, bot ID: %s",
					this.sessionId,
					this.botUserId,
				);
				break;
			}
			case "THREAD_CREATE": {
				const thread = payload.d as {
					id: string;
					guild_id: string;
					name: string;
				};
				this.logger.info("Thread created: %s (%s)", thread.name, thread.id);
				// Thread creation event can be handled here if needed
				break;
			}
			case "MESSAGE_CREATE": {
				const message = payload.d as DiscordMessage;
				this.logger.debug(
					"Message payload: %s",
					JSON.stringify(message, null, 2),
				);
				this.logger.debug("Message received from %s", message.author.username);

				// Ignore bot messages to prevent loops
				if (message.author.bot) {
					this.logger.debug("Ignoring bot message");
					break;
				}

				if (!message.guild_id) {
					this.logger.debug("Ignoring message - no guild id");
					break;
				}

				// Ignore empty messages
				if (!message.content || message.content.trim() === "") {
					this.logger.debug("Ignoring empty message");
					break;
				}

				// Check if message mentions the bot
				const mentionsBot = message.mentions.some(
					(mention) => mention.id === this.botUserId,
				);

				// Check if message is a reply to a bot message
				const isReplyToBot = message.message_reference
					? await this.isReplyToBotMessage(
							message.message_reference.channel_id,
							message.message_reference.message_id,
						)
					: false;

				// Process if: mentions bot, replies to bot, or contains help keywords
				const contentLower = message.content.toLowerCase();
				const needsHelp = HELP_KEYWORDS.some((keyword) =>
					contentLower.includes(keyword),
				);

				if (!mentionsBot && !isReplyToBot && !needsHelp) {
					this.logger.debug(
						"Ignoring message - no bot interaction or help keywords detected",
					);
					break;
				}

				// Check if message is in a thread
				const isThread = this.isThreadChannel(message.channel_type);
				let requestPayload: ThreadMessagesPayload;

				if (isThread) {
					this.logger.info(
						"Processing thread help request from %s",
						message.author.username,
					);
					const threadMessages = await this.fetchThreadMessages(
						message.channel_id,
					);
					requestPayload = {
						messages: threadMessages,
						channelId: message.channel_id,
						guildId: message.guild_id,
						isThread: true,
					};
				} else {
					this.logger.info(
						"Processing help request from %s",
						message.author.username,
					);
					const imageAttachments = message.attachments
						.filter(
							(att) =>
								att.content_type?.startsWith("image/") ||
								/\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename),
						)
						.map((att) => att.url);

					requestPayload = {
						messages: [
							{
								id: message.id,
								content: message.content,
								timestamp: message.timestamp,
								isBot: false,
								author: {
									id: message.author.id,
									username: message.author.username,
									...(message.author.global_name && {
										global_name: message.author.global_name,
									}),
								},
								...(imageAttachments.length > 0 && {
									images: imageAttachments,
								}),
							},
						],
						guildId: message.guild_id,
						channelId: message.channel_id,
						isThread: false,
					};
				}

				// Use internal fetch to process messages with agent context
				this.logger.debug(
					"Request payload: %s",
					JSON.stringify(requestPayload, null, 2),
				);

				const response = await this.router.fetch(
					new Request("http://internal/api/status/process", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(requestPayload),
					}),
				);

				if (!response.ok) {
					this.logger.error(
						"Failed to process message:\n\n",
						await response.text(),
					);
					return;
				}

				this.logger.debug("Message processed successfully");

				break;
			}
		}
	}

	private identify() {
		const payload = {
			op: 2,
			d: {
				token: this.token,
				intents: 33281, // GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT
				properties: {
					os: "linux",
					browser: "agentuity",
					device: "agentuity",
				},
			},
		};
		this.send(payload);
	}

	private startHeartbeat(interval: number) {
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, interval);
	}

	private sendHeartbeat() {
		const payload = {
			op: 1,
			d: this.sequenceNumber,
		};
		this.send(payload);
	}

	private send(payload: unknown) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	private cleanup() {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private async fetchThreadMessages(
		channelId: string,
	): Promise<ProcessedMessage[]> {
		const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;

		const response = await fetch(url, {
			headers: {
				Authorization: `Bot ${this.token}`,
			},
		});

		if (!response.ok) {
			this.logger.error(
				"Failed to fetch thread messages: %s",
				await response.text(),
			);
			return [];
		}

		const messages = (await response.json()) as DiscordMessage[];

		return messages.reverse().map((msg) => {
			const imageAttachments = msg.attachments
				.filter(
					(att) =>
						att.content_type?.startsWith("image/") ||
						/\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename),
				)
				.map((att) => att.url);

			return {
				id: msg.id,
				content: msg.content,
				timestamp: msg.timestamp,
				isBot: msg.author.bot || false,
				author: {
					id: msg.author.id,
					username: msg.author.username,
					...(msg.author.global_name && {
						global_name: msg.author.global_name,
					}),
				},
				...(imageAttachments.length > 0 && { images: imageAttachments }),
			};
		});
	}

	private isThreadChannel(channelType: number): boolean {
		// Channel type 11 = PUBLIC_THREAD, 12 = PRIVATE_THREAD
		return channelType === 11 || channelType === 12;
	}

	private async isReplyToBotMessage(
		channelId: string,
		messageId: string,
	): Promise<boolean> {
		try {
			const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
			const response = await fetch(url, {
				headers: {
					Authorization: `Bot ${this.token}`,
				},
			});

			if (!response.ok) {
				this.logger.error(
					"Failed to fetch message for reply check: %s",
					await response.text(),
				);
				return false;
			}

			const referencedMessage = (await response.json()) as DiscordMessage;
			return referencedMessage.author.id === this.botUserId;
		} catch (error) {
			this.logger.error("Error checking reply message:", error);
			return false;
		}
	}

	async sendMessage(channelId: string, content: string, messageId?: string) {
		const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
		const body: {
			content: string;
			message_reference?: { message_id: string };
		} = {
			content,
		};

		if (messageId) {
			body.message_reference = { message_id: messageId };
		}

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bot ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			this.logger.error("Failed to send message: %s", await response.text());
		}

		return response.json();
	}

	async closeThread(channelId: string) {
		const url = `https://discord.com/api/v10/channels/${channelId}`;

		const response = await fetch(url, {
			method: "PATCH",
			headers: {
				Authorization: `Bot ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				archived: true,
				locked: false,
			}),
		});

		if (!response.ok) {
			this.logger.error("Failed to close thread: %s", await response.text());
			return false;
		}

		this.logger.info("Closed thread %s", channelId);
		return true;
	}

	disconnect() {
		this.cleanup();
		this.ws?.close();
	}
}
