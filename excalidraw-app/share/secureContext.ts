// Live sessions and shareable links encrypt in the browser with crypto.subtle, which browsers give
// only to a secure context (HTTPS, or localhost). Over plain HTTP, as on an Irate-Box hub's own
// address, generating the room key throws and the Start session button does nothing. Checked first,
// so the dialog can say so and offer the HTTPS address instead.

// crypto.subtle itself is what is needed, and a browser leaves it out of a page that is not secure.
export const canEncryptHere = () =>
  typeof window !== "undefined" && !!window.crypto?.subtle;

// The same page at its HTTPS address (the hub serves HTTPS on the standard port), with its fragment:
// a room link's key is there, and the browser never sends it to the server. And the box's
// certificate page, where a device learns to trust that address.
export const httpsAddress = () =>
  `https://${window.location.hostname}${window.location.pathname}${window.location.search}${window.location.hash}`;
export const certificateAddress = () =>
  `${window.location.protocol}//${window.location.host}/certificate`;

export const NEEDS_HTTPS =
  "Live collaboration and shareable links encrypt the drawing in your browser. " +
  "Browsers allow that only on a secure (HTTPS) address, and this page is on plain HTTP.";
