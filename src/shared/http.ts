export const ok = (b: unknown) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});
export const created = (b: unknown) => ({
  statusCode: 201,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});
export const bad = (m: string) => ({
  statusCode: 400,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: m }),
});
