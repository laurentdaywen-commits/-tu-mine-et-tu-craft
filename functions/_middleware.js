const encoder = new TextEncoder();

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function onRequest({ request, env, next }) {
  if (!env.GAME_USERNAME || !env.GAME_PASSWORD) {
    return new Response("Protection du jeu non configuree. Contactez l'administrateur.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Basic\s+(.+)$/i);

  if (match) {
    try {
      const decoded = atob(match[1]);
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        const username = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);

        const [givenUserHash, expectedUserHash, givenPasswordHash, expectedPasswordHash] =
          await Promise.all([
            sha256(username),
            sha256(env.GAME_USERNAME),
            sha256(password),
            sha256(env.GAME_PASSWORD),
          ]);

        if (
          constantTimeEqual(givenUserHash, expectedUserHash) &&
          constantTimeEqual(givenPasswordHash, expectedPasswordHash)
        ) {
          return next();
        }
      }
    } catch {
      // Invalid credentials are handled below.
    }
  }

  return new Response("Acces reserve au proprietaire du jeu.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TU MINE ET TU CRAFT", charset="UTF-8"',
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
