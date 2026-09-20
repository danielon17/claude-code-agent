# infrastructure/diff

- `DiffGenerator.ts` — usa el paquete `diff` para construir un unified diff
  entre el `sourceText` original de una `CodeUnit` y la versión
  refactorizada devuelta por el modelo, y para aplicar (`Diff.applyPatch`)
  ese parche sobre el archivo real cuando se usa `refactor --apply`.
