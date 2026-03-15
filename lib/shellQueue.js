export function createShellQueue(runCommand, options = {}) {
  const queue = [];
  let running = false;

  async function execute(command) {
    if (typeof options.onCommandStart === "function") {
      options.onCommandStart(command);
    }

    const result = await runCommand(command, {
      onOutput: options.onOutput,
    });

    if (typeof options.onCommandEnd === "function") {
      options.onCommandEnd(command, result);
    }

    return result;
  }

  async function pump() {
    if (running) return;
    running = true;

    while (queue.length > 0) {
      const task = queue.shift();
      try {
        const result = await execute(task.command);
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }
    }

    running = false;
  }

  function enqueue(command) {
    return new Promise((resolve, reject) => {
      queue.push({ command, resolve, reject });
      void pump();
    });
  }

  async function runMany(commands) {
    const results = [];
    for (const command of commands) {
      const result = await enqueue(command);
      results.push(result);
    }
    return results;
  }

  return {
    enqueue,
    runMany,
    size: () => queue.length,
    isRunning: () => running,
  };
}