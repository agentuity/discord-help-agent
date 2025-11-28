import { DiscordGateway } from "./gateway";

export let gateway: DiscordGateway | null = null;

export function initializeGateway(token: string, router: any, logger: any) {
	if (!gateway) {
		gateway = new DiscordGateway(token, router, logger);
		gateway.connect();
	}
	return gateway;
}

