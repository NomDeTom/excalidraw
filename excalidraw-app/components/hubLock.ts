// Device locks for the Irate-Box hub's gallery saves (store.py, "locks"): a port of the hub's
// static/lock.js, keeping its storage keys ("hublock:<kind>:<id>") so a lock made here and one
// made in the hub's other editors live side by side on the hub's origin.
//
// No password: the hub serves plain HTTP on open WiFi. The browser keeps a random seed and
// sends only head = SHA-256 applied n times to it (X-Lock-New); each change sends the value
// one step earlier (X-Lock), which the hub checks and keeps. A listener sees only used values.
// SHA-256 is written out because crypto.subtle is not available over plain HTTP.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** SHA-256 of exactly 32 bytes (all the chain ever hashes): one padded block. */
export const sha256x32 = (bytes: Uint8Array): Uint8Array => {
  const block = new Uint8Array(64);
  block.set(bytes);
  block[32] = 0x80;
  block[62] = 0x01; // message length: 256 bits
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  for (let i = 0; i < 16; i++) {
    W[i] =
      (block[i * 4] << 24) |
      (block[i * 4 + 1] << 16) |
      (block[i * 4 + 2] << 8) |
      block[i * 4 + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, k] = h;
  for (let i = 0; i < 64; i++) {
    const S1 =
      ((e >>> 6) | (e << 26)) ^
      ((e >>> 11) | (e << 21)) ^
      ((e >>> 25) | (e << 7));
    const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 =
      ((a >>> 2) | (a << 30)) ^
      ((a >>> 13) | (a << 19)) ^
      ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    k = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  const out = new Uint8Array(32);
  [a, b, c, d, e, f, g, k].forEach((v, i) => {
    const x = (v + h[i]) >>> 0;
    out[i * 4] = x >>> 24;
    out[i * 4 + 1] = (x >>> 16) & 255;
    out[i * 4 + 2] = (x >>> 8) & 255;
    out[i * 4 + 3] = x & 255;
  });
  return out;
};

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) =>
  Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));

/** SHA-256 applied `times` times to the seed. */
export const walk = (seedHex: string, times: number) => {
  let v: Uint8Array = unhex(seedHex);
  for (let i = 0; i < times; i++) {
    v = sha256x32(v);
  }
  return hex(v);
};

export const LOCK_N = 4096;
const RENEW_AT = 64;
const slot = (kind: string, id: string) => `hublock:${kind}:${id}`;

export type LockChange = {
  headers: Record<string, string>;
  done: () => void;
};

export const createLock = () => {
  const seed = hex(crypto.getRandomValues(new Uint8Array(32)));
  return { seed, header: `${walk(seed, LOCK_N)}:${LOCK_N}` };
};

export const keepLock = (kind: string, id: string, seed: string) => {
  try {
    localStorage.setItem(slot(kind, id), seed);
  } catch {
    // private mode: the lock goes with the tab
  }
};

export const lockSeed = (kind: string, id: string) => {
  try {
    return localStorage.getItem(slot(kind, id));
  } catch {
    return null;
  }
};

export const hasLock = (kind: string, id: string) => !!lockSeed(kind, id);

export const forgetLock = (kind: string, id: string) => {
  try {
    localStorage.removeItem(slot(kind, id));
  } catch {
    // nothing to forget
  }
};

/** Headers for one change to a locked item; call done() once the hub accepted it. */
export const lockChange = (
  kind: string,
  id: string,
  lockN: number,
): LockChange | null => {
  const seed = lockSeed(kind, id);
  if (!seed || !(lockN >= 1)) {
    return null;
  }
  const headers: Record<string, string> = { "X-Lock": walk(seed, lockN - 1) };
  let next: ReturnType<typeof createLock> | null = null;
  if (lockN <= RENEW_AT) {
    next = createLock();
    headers["X-Lock-Next"] = next.header;
  }
  return {
    headers,
    done: () => {
      if (next) {
        keepLock(kind, id, next.seed);
      }
    },
  };
};
