const JSON_HEADER = { "content-type": "application/json" };

export const ok = (b: unknown) => ({
  statusCode: 200,
  headers: JSON_HEADER,
  body: JSON.stringify(b),
});

export const created = (b: unknown) => ({
  statusCode: 201,
  headers: JSON_HEADER,
  body: JSON.stringify(b),
});

export const bad = (m: string) => ({
  statusCode: 400,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const internal = (m = "Internal server error") => ({
  statusCode: 500,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});
