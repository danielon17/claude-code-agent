/**
 * Puerto de salida hacia el sistema de archivos. Aísla los use cases de
 * `node:fs`, lo que permite testearlos con un adaptador en memoria.
 */
export interface FileSystemPort {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, contents: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
}
