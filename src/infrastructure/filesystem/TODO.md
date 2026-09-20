# infrastructure/filesystem

- `NodeFileSystem.ts` — implementación de `FileSystemPort` sobre
  `node:fs/promises`, usada por defecto en producción. Los tests unitarios
  de los use cases usan un adaptador en memoria en su lugar.
