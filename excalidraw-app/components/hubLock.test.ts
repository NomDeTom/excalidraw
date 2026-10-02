import {
  createLock,
  forgetLock,
  hasLock,
  keepLock,
  LOCK_N,
  lockChange,
  sha256x32,
  walk,
} from "./hubLock";

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("hubLock", () => {
  it("hashes 32 bytes as SHA-256 does", () => {
    // SHA-256 of 32 zero bytes
    expect(hex(sha256x32(new Uint8Array(32)))).toBe(
      "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    );
  });

  it("walks the chain so each proof hashes to the one before", () => {
    const seed = "11".repeat(32);
    const head = walk(seed, 10);
    const proof = walk(seed, 9);
    const bytes = Uint8Array.from(
      proof.match(/../g)!.map((x) => parseInt(x, 16)),
    );
    expect(hex(sha256x32(bytes))).toBe(head);
  });

  it("creates a lock whose header is the chain's head", () => {
    const lock = createLock();
    expect(lock.header).toBe(`${walk(lock.seed, LOCK_N)}:${LOCK_N}`);
  });

  it("keeps, finds and forgets a seed, and sends the next proof", () => {
    const lock = createLock();
    keepLock("saves", "abc", lock.seed);
    expect(hasLock("saves", "abc")).toBe(true);
    const change = lockChange("saves", "abc", LOCK_N)!;
    expect(change.headers["X-Lock"]).toBe(walk(lock.seed, LOCK_N - 1));
    expect(change.headers["X-Lock-Next"]).toBeUndefined();
    forgetLock("saves", "abc");
    expect(hasLock("saves", "abc")).toBe(false);
    expect(lockChange("saves", "abc", LOCK_N)).toBeNull();
  });

  it("starts a new chain near the end, kept only once done()", () => {
    const lock = createLock();
    keepLock("saves", "low", lock.seed);
    const change = lockChange("saves", "low", 10)!;
    expect(change.headers["X-Lock-Next"]).toMatch(/^[0-9a-f]{64}:4096$/);
    change.done();
    expect(localStorage.getItem("hublock:saves:low")).not.toBe(lock.seed);
  });
});
