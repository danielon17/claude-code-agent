import { readFile, writeFile, stat } from 'node:fs/promises';
import type { FileSystemPort } from '../../core/ports/FileSystem.port.js';
import { FileSystemError } from '../../shared/errors.js';

/** Adaptador de `FileSystemPort` sobre `node:fs/promises`, usado en producción. */
export class NodeFileSystem implements FileSystemPort {
  async readFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`No se pudo leer el archivo: ${filePath}`, error);
    }
  }

  async writeFile(filePath: string, contents: string): Promise<void> {
    try {
      await writeFile(filePath, contents, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`No se pudo escribir el archivo: ${filePath}`, error);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch (error) {
      throw new FileSystemError(`No se pudo acceder a la ruta: ${path}`, error);
    }
  }
}
