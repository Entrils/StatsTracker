export function createClientErrorHelpers({
  CLIENT_ERROR_LOG,
  CLIENT_ERROR_ROTATE_BYTES,
  MAX_CLIENT_ERRORS,
  fs,
}) {
  const clientErrorBuffer = [];

  function pushClientError(entry) {
    clientErrorBuffer.push(entry);
    if (clientErrorBuffer.length > MAX_CLIENT_ERRORS) {
      clientErrorBuffer.shift();
    }
  }

  async function rotateClientErrorLog() {
    try {
      const stat = await fs.stat(CLIENT_ERROR_LOG);
      if (stat.size < CLIENT_ERROR_ROTATE_BYTES) return;
      const backup = `${CLIENT_ERROR_LOG}.1`;
      await fs.rename(CLIENT_ERROR_LOG, backup).catch(() => {});
    } catch {
      // ignore if file doesn't exist
    }
  }

  return { clientErrorBuffer, pushClientError, rotateClientErrorLog };
}
