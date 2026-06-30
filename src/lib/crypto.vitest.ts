import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "./crypto.js";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");
const SHORT_KEY = Buffer.alloc(16, 1).toString("base64");

describe("encryptToken", () => {
  describe("happy path", () => {
    it("returns a Buffer containing IV, auth tag, and ciphertext for a valid plaintext", () => {
      // Arrange
      const plaintext = "access-token-abc123";

      // Act
      const result = encryptToken(plaintext, VALID_KEY);

      // Assert
      expect(Buffer.isBuffer(result)).toBe(true);
      // IV (12) + auth tag (16) + at least one ciphertext byte
      expect(result.byteLength).toBeGreaterThan(12 + 16);
    });

    it("produces different ciphertext on each call (random IV)", () => {
      // Arrange
      const plaintext = "same-token";

      // Act
      const first = encryptToken(plaintext, VALID_KEY);
      const second = encryptToken(plaintext, VALID_KEY);

      // Assert
      expect(first.toString("hex")).not.toBe(second.toString("hex"));
    });
  });

  describe("edge cases", () => {
    it("encrypts an empty string without throwing", () => {
      // Arrange
      const plaintext = "";

      // Act
      const result = encryptToken(plaintext, VALID_KEY);

      // Assert
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("encrypts a very long token string without throwing", () => {
      // Arrange
      const plaintext = "x".repeat(4096);

      // Act
      const result = encryptToken(plaintext, VALID_KEY);

      // Assert
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("error paths", () => {
    it("throws when the key decodes to fewer than 32 bytes", () => {
      // Arrange — 16-byte key (too short for AES-256)
      const plaintext = "some-token";

      // Act & Assert
      expect(() => encryptToken(plaintext, SHORT_KEY)).toThrow(
        "TOKEN_ENCRYPTION_KEY must be a 32-byte base64-encoded value"
      );
    });
  });
});

describe("decryptToken", () => {
  describe("happy path", () => {
    it("round-trips: decrypt(encrypt(x)) === x", () => {
      // Arrange
      const plaintext = "test-access-token-12345";

      // Act
      const encrypted = encryptToken(plaintext, VALID_KEY);
      const result = decryptToken(encrypted, VALID_KEY);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("round-trips an empty string correctly", () => {
      // Arrange
      const plaintext = "";

      // Act
      const encrypted = encryptToken(plaintext, VALID_KEY);
      const result = decryptToken(encrypted, VALID_KEY);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("round-trips unicode characters correctly", () => {
      // Arrange
      const plaintext = "token-with-unicode-🔑-and-漢字";

      // Act
      const encrypted = encryptToken(plaintext, VALID_KEY);
      const result = decryptToken(encrypted, VALID_KEY);

      // Assert
      expect(result).toBe(plaintext);
    });
  });

  describe("error paths", () => {
    it("throws when decrypting with a different key (auth tag mismatch)", () => {
      // Arrange
      const plaintext = "secret-token";
      const wrongKey = Buffer.alloc(32, 9).toString("base64");
      const encrypted = encryptToken(plaintext, VALID_KEY);

      // Act & Assert
      expect(() => decryptToken(encrypted, wrongKey)).toThrow();
    });

    it("throws when the payload is truncated (missing auth tag)", () => {
      // Arrange
      const plaintext = "secret-token";
      const encrypted = encryptToken(plaintext, VALID_KEY);
      const truncated = encrypted.subarray(0, 10); // only part of the IV

      // Act & Assert
      expect(() => decryptToken(truncated, VALID_KEY)).toThrow();
    });

    it("throws when the payload has been tampered with", () => {
      // Arrange
      const plaintext = "secret-token";
      const encrypted = encryptToken(plaintext, VALID_KEY);
      const tampered = Buffer.from(encrypted);
      tampered[28] ^= 0xff; // flip bits in the ciphertext region

      // Act & Assert
      expect(() => decryptToken(tampered, VALID_KEY)).toThrow();
    });
  });
});
