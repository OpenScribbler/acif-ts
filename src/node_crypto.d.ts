declare module "node:crypto" {
  export interface Hash {
    update(data: Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha1" | "sha256"): Hash;
}
