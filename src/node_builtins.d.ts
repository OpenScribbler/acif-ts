declare module "node:fs/promises" {
  export interface FileSystemStats {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }

  export function lstat(path: string): Promise<FileSystemStats>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function readdir(path: string): Promise<string[]>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function symlink(target: string, path: string): Promise<void>;
  export function writeFile(path: string, data: string | Uint8Array): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare const process: {
  argv: string[];
  exitCode?: number;
  stdin: AsyncIterable<string | Uint8Array>;
  stdout: {
    write(chunk: string | Uint8Array): boolean;
  };
  stderr: {
    write(chunk: string | Uint8Array): boolean;
  };
};
