const MAX_MESSAGE_LENGTH = 2000;

export function chunkMessage(
	message: string,
	maxLength = MAX_MESSAGE_LENGTH,
): string[] {
	if (message.length <= maxLength) {
		return [message];
	}

	const chunks: string[] = [];
	let remaining = message;

	while (remaining.length > 0) {
		if (remaining.length <= maxLength) {
			chunks.push(remaining);
			break;
		}

		// Try to split at a newline or space near the limit
		let splitIndex = maxLength;
		const lastNewline = remaining.lastIndexOf("\n", maxLength);
		const lastSpace = remaining.lastIndexOf(" ", maxLength);

		if (lastNewline > maxLength * 0.8) {
			splitIndex = lastNewline + 1;
		} else if (lastSpace > maxLength * 0.8) {
			splitIndex = lastSpace + 1;
		}

		chunks.push(remaining.substring(0, splitIndex).trim());
		remaining = remaining.substring(splitIndex).trim();
	}

	return chunks;
}
