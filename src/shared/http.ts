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

export const accepted = (b: unknown) => ({
  statusCode: 202,
  headers: JSON_HEADER,
  body: JSON.stringify(b),
});

export const bad = (m: string) => ({
  statusCode: 400,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const forbidden = (m = "Access denied") => ({
  statusCode: 403,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const notFound = (m = "Not found") => ({
  statusCode: 404,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const conflict = (m: string) => ({
  statusCode: 409,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const internal = (m = "Internal server error") => ({
  statusCode: 500,
  headers: JSON_HEADER,
  body: JSON.stringify({ message: m }),
});

export const serviceUnavailable = (b: unknown) => ({
  statusCode: 503,
  headers: JSON_HEADER,
  body: JSON.stringify(b),
});
