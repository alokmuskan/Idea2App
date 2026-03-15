function isLikelyErrorLine(line) {
  return /(error|exception|failed|cannot|uncaught)/i.test(line);
}

function isStackLine(line) {
  return /\bat\b\s+.*:\d+:\d+/.test(line);
}

export function createErrorRecovery(options = {}) {
  let errorBuffer = [];
  let fixing = false;

  function addOutputLine(line) {
    if (isLikelyErrorLine(line) || isStackLine(line)) {
      errorBuffer.push(line);
      if (errorBuffer.length > 100) {
        errorBuffer = errorBuffer.slice(-100);
      }
    }
  }

  function getErrorTrace() {
    return errorBuffer.join("\n").trim();
  }

  async function tryAutoFix(context = {}) {
    if (fixing) return { fixed: false, reason: "already_running" };

    const trace = getErrorTrace();
    if (!trace) return { fixed: false, reason: "no_error_trace" };
    if (typeof options.requestFix !== "function") {
      return { fixed: false, reason: "no_fix_handler" };
    }

    fixing = true;
    try {
      const fixResult = await options.requestFix({ trace, ...context });
      if (typeof options.onFixed === "function") {
        options.onFixed({ trace, fixResult });
      }
      errorBuffer = [];
      return { fixed: true, fixResult };
    } catch (error) {
      if (typeof options.onFixFailed === "function") {
        options.onFixFailed(error);
      }
      return { fixed: false, reason: "fix_failed", error };
    } finally {
      fixing = false;
    }
  }

  return {
    addOutputLine,
    getErrorTrace,
    tryAutoFix,
    isFixing: () => fixing,
  };
}