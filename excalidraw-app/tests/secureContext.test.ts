import {
  canEncryptHere,
  certificateAddress,
  httpsAddress,
} from "../share/secureContext";

// Live sessions and shareable links need crypto.subtle, which a browser leaves out of a page on plain HTTP.
describe("secure context", () => {
  const subtle = window.crypto.subtle;

  afterEach(() => {
    Object.defineProperty(window.crypto, "subtle", {
      value: subtle,
      configurable: true,
    });
  });

  it("can encrypt where crypto.subtle is there", () => {
    expect(canEncryptHere()).toBe(!!subtle);
  });

  it("cannot encrypt where crypto.subtle is missing, as on plain HTTP", () => {
    Object.defineProperty(window.crypto, "subtle", {
      value: undefined,
      configurable: true,
    });
    expect(canEncryptHere()).toBe(false);
  });

  it("offers the same page at its HTTPS address, its fragment (a room's key) kept", () => {
    window.history.pushState({}, "", "/draw/?x=1#room=abc,def");
    expect(httpsAddress()).toBe(
      `https://${window.location.hostname}/draw/?x=1#room=abc,def`,
    );
    expect(certificateAddress()).toBe(
      `${window.location.protocol}//${window.location.host}/certificate`,
    );
  });
});
