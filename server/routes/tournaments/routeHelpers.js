export function respondWithOutcome(res, outcome, successPayload = { ok: true }) {
  if (outcome?.error) {
    return res.status(outcome.status || 400).json({ error: outcome.error });
  }
  return res.json(successPayload);
}

export function respondServerError(res, logger, label, message, err) {
  logger.error(`${label}:`, err);
  return res.status(500).json({ error: message });
}
