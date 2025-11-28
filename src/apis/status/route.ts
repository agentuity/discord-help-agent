import { createRouter } from "@agentuity/runtime";
import type { ThreadMessagesPayload } from "./gateway";
import { gateway } from "./instance";
import { chunkMessage } from "./utils";

const router = createRouter();

// Internal endpoint to process Discord messages with agent context
router.post("/process", async (c) => {
	const payload = await c.req.json<ThreadMessagesPayload>();

	c.logger.info(
		"Processing %d message(s) from channel %s (thread: %s)",
		payload.messages.length,
		payload.channelId,
		payload.isThread,
	);

	const result = await c.agent.help.run({
		messages: payload.messages,
		channelId: payload.channelId,
		isThread: payload.isThread,
	});

	c.logger.debug("Agent result: %o", result);

	if (gateway) {
		c.logger.info("Sending response to channel %s", payload.channelId);

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
			c.logger.info("Split message into %d chunks", chunks.length);
		}
	} else {
		c.logger.warn("No response generated or gateway not available");
	}

	return c.json({ success: true });
});

router.get("/", (c) => {
	return c.json({
		status: "connected",
		timestamp: new Date().toISOString(),
		version: "1.0.0",
	});
});

export default router;