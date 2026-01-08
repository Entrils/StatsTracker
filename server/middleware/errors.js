export function payloadTooLargeHandler(err, req, res, next) {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "Payload too large" });
  }
  return next(err);
}
