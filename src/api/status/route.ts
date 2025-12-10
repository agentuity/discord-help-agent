import { createRouter } from "@agentuity/runtime";
import orchestratorAgent from "../../agent/orchestrator/agent";
import type { ThreadMessagesPayload } from "../../gateway/gateway";
import { gateway } from "../../gateway/instance";
import { chunkMessage } from "../../utils/chunkMessage";

const router = createRouter();

// Internal endpoint to process Discord messages with agent context
router.post("/process", async (c) => {
	const payload = await c.req.json<ThreadMessagesPayload>();
	const logger = c.get("logger");

	logger.info(
		"Processing %d message(s) from channel %s (thread: %s)",
		payload.messages.length,
		payload.channelId,
		payload.isThread,
	);

	try {
		const result = await orchestratorAgent.run({
			messages: payload.messages,
			channelId: payload.channelId,
			guildId: payload.guildId,
			isThread: payload.isThread,
		});

		logger.debug("Agent result: %o", result);

		if (gateway) {
			logger.info("Sending response to channel %s", payload.channelId);

			const chunks = chunkMessage(result.message);

			// Send chunks sequentially
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				if (!chunk) continue;

				const messageId = i === 0 ? result.metadata?.messageId : undefined;
				if (messageId) {
					await gateway.sendMessage(payload.channelId, chunk, messageId);
				} else {
					await gateway.sendMessage(payload.channelId, chunk);
				}
			}

			if (chunks.length > 1) {
				logger.info("Split message into %d chunks", chunks.length);
			}

			// Close thread if requested
			if (result.metadata?.shouldCloseThread && payload.isThread) {
				logger.info("Closing thread %s", payload.channelId);
				await gateway.closeThread(payload.channelId);
			}
		} else {
			logger.warn("No response generated or gateway not available");
		}

		return c.json({ success: true });
	} catch (error) {
		logger.error("Agent run failed: %o", error);

		if (gateway) {
			await gateway.sendMessage(
				payload.channelId,
				"I can't help, my thinking capabilities seem not to be functioning.",
			);
		}

		return c.json({ success: false, error: "Agent run failed" }, 500);
	}
});

router.get("/", (c) => {
	return c.json({
		status: "connected",
		timestamp: new Date().toISOString(),
		version: "1.0.0",
	});
});

export default router;
