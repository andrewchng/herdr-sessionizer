import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";

export interface PromptTextOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WritableStream;
}

/**
 * Read a single line of text. Returns the trimmed value on Enter.
 * Returns `null` when the user cancels with Esc or Ctrl+C.
 * Empty submit is still `""` so callers can re-prompt.
 */
export async function promptText(
  message: string,
  options: PromptTextOptions = {}
): Promise<string | null> {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;

  if (!input.isTTY) {
    return promptTextLine(message, input, output);
  }

  return promptTextInteractive(message, input, output);
}

async function promptTextLine(
  message: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<string | null> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

async function promptTextInteractive(
  message: string,
  input: NodeJS.ReadStream,
  output: NodeJS.WritableStream
): Promise<string | null> {
  output.write(message);

  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();

  let value = "";

  return new Promise<string | null>((resolve) => {
    const finish = (result: string | null) => {
      input.off("keypress", onKeypress);
      input.setRawMode(wasRaw ?? false);
      output.write("\n");
      resolve(result);
    };

    const onKeypress = (str: string | undefined, key: Key) => {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        finish(null);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish(value.trim());
        return;
      }

      if (key.name === "backspace" || key.name === "delete") {
        if (value.length === 0) return;
        value = value.slice(0, -1);
        output.write("\b \b");
        return;
      }

      if (key.ctrl || key.meta || key.name === "tab") return;
      if (!str || str < " ") return;

      value += str;
      output.write(str);
    };

    input.on("keypress", onKeypress);
  });
}
