import { createRouter } from "@agentuity/runtime";
import { zValidator } from "@hono/zod-validator";
import docsAgent, { inputSchema } from "./agent";

const router = createRouter();

router.post("/", zValidator("json", inputSchema), async (c) => {
	const request = await c.req.json();
	const response = await docsAgent.run(request);

	return c.json(response);
});

export default router;
