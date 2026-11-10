import { createHmac } from "node:crypto";
import { config } from "./config.mjs";

/**
 * Cryptographic verification utilities for E2E tests:
 * - imgproxy HMAC-SHA256 URL verification
 * - Argon2id credential hash structure validation
 */

export class CryptoAssertionHelper {
  /**
   * Validate that a string matches the standard Argon2id RFC/PHC format.
   * e.g. $argon2id$v=19$m=65536,t=3,p=4$...
   */
  static isArgon2idHash(hash) {
    if (typeof hash !== "string") return false;
    const argonRegex = /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/;
    return argonRegex.test(hash);
  }

  /**
   * Generates or validates an imgproxy HMAC-SHA256 signature for a given path.
   * imgproxy algorithm:
   * 1. Decode keyHex and saltHex from hex into Buffers.
   * 2. HMAC-SHA256(keyBin, saltBin + path).
   * 3. Base64url encode the digest (without '=' padding).
   */
  static signImgproxyPath(path, keyHex = config.imgproxy.keyHex, saltHex = config.imgproxy.saltHex) {
    const keyBin = Buffer.from(keyHex, "hex");
    const saltBin = Buffer.from(saltHex, "hex");
    const pathBin = Buffer.from(path, "utf8");

    const hmac = createHmac("sha256", keyBin);
    hmac.update(saltBin);
    hmac.update(pathBin);

    return hmac
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Verifies an imgproxy signed URL.
   * Checks structure, signature validity, and target domain.
   */
  static verifyImgproxyUrl(signedUrl, expectedSourceStorageKey, expectedHost = null) {
    try {
      const url = new URL(signedUrl);
      if (expectedHost && url.host !== expectedHost) {
        return { valid: false, error: `Host mismatch: expected ${expectedHost}, got ${url.host}` };
      }

      // Path format: /<signature>/<processing_options>/<source_url>
      // e.g. /<sig>/fill/300/300/no/1/plain/s3://media/products/...
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) {
        return { valid: false, error: "Invalid imgproxy path segments" };
      }

      const signature = parts[0];
      // Extract everything after /<signature> preserving original slashes
      const sigPrefix = `/${signature}`;
      const pathAfterSignature = url.pathname.substring(sigPrefix.length);

      const expectedSig = this.signImgproxyPath(pathAfterSignature);
      if (signature !== expectedSig) {
        return { valid: false, error: `Signature mismatch: got ${signature}, expected ${expectedSig}` };
      }

      if (expectedSourceStorageKey && !url.pathname.includes(expectedSourceStorageKey)) {
        return { valid: false, error: `Expected storage key ${expectedSourceStorageKey} not found in path` };
      }

      return { valid: true, signature, path: pathAfterSignature };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}
